/**
 * Smoke test for the mock client: runs all 12 demo steps from a fresh state, then edge cases.
 * Run: pnpm smoke
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { MockAutorailClient, MOCK_ADDRESSES as A } from "../lib/autorail/mock";
import { formatAmount as f, tusd } from "../lib/autorail/format";
import { decodeError } from "../lib/autorail/errors";

let failures = 0;
const check = (label: string, ok: boolean, got?: unknown) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${got !== undefined ? `  (${String(got)})` : ""}`);
};
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return decodeError(e).code;
  }
};

async function main() {
  const c = new MockAutorailClient();
  (c as any).delay = () => Promise.resolve(); // no simulated latency
  await c.resetDemo("fresh");

  for (let i = 1; i <= 12; i++) {
    const s = await c.runDemoStep(String(i));
    console.log(`  step ${String(i).padStart(2)}  ${s.status.padEnd(6)}  ${s.result ?? s.error}  [${s.txHashes.length} tx]`);
    check(`step ${i} done`, s.status === "done");
  }

  const v = await c.getVaultStats();
  check("vault total 6.06", v.totalAssets === tusd("6.06"), f(v.totalAssets));
  check("vault outstanding 0", v.outstanding === 0n);
  check("fees 0.06", v.feesEarned === tusd("0.06"));
  const rep = (await c.getRepayment("1"))!;
  check("waterfall 3.00 / 0.06 / 0.94 / 0.20", rep.vaultPrincipal === tusd("3") && rep.vaultFee === tusd("0.06") && rep.vendorRemainder === tusd("0.94") && rep.unspentSwept === tusd("0.2"));
  check("vendor balance 1.14", (await c.getBalances(A.vendor)).tUSD8 === tusd("1.14"));
  check("lab balance 1.00", (await c.getBalances(A.lab)).tUSD8 === tusd("1"));
  check("lender position 6.06", (await c.getLenderPosition(A.lender)).value === tusd("6.06"));
  check("annotator A got 1.00", (await c.getBalances(A.annotatorA)).tUSD8 === tusd("1"));

  const due = c.now() + 30 * 86400;
  check("duplicate invoice", (await code(c.createReceivable({ invoiceNumber: "INV-001", buyer: A.lab, amount: tusd("1"), dueDate: due, invoiceHash: `0x${"11".repeat(32)}` }))) === "DuplicateInvoice");
  check("self-dealing", (await code(c.createReceivable({ invoiceNumber: "INV-X", buyer: A.vendor, amount: tusd("1"), dueDate: due, invoiceHash: `0x${"22".repeat(32)}` }))) === "SelfDealing");
  const r = await c.createReceivable({ invoiceNumber: "INV-003", buyer: A.lab, amount: tusd("1"), dueDate: due, invoiceHash: `0x${"33".repeat(32)}` });
  check("fund before confirm", (await code(c.fundAdvance(r.receivableId))) === "NotConfirmed");
  await c.confirmReceivable(r.receivableId);
  const o = (await c.getAdvanceOffer(r.receivableId))!;
  check("score rose after on-time repayment", o.vendorScore === 65, o.vendorScore);
  const fu = await c.fundAdvance(r.receivableId);
  await c.grantSession(fu.jobWallet, { key: A.payoutKey, payees: [A.annotatorA], perTxCap: tusd("0.5"), totalCap: tusd("0.6"), expiresAt: c.now() + 3600 });
  check("pay within caps", (await code(c.pay(fu.jobWallet, { sessionKey: A.payoutKey, payee: A.annotatorA, amount: tusd("0.4"), memo: "a" }))) === "ok");
  check("total cap", (await code(c.pay(fu.jobWallet, { sessionKey: A.payoutKey, payee: A.annotatorA, amount: tusd("0.4"), memo: "b" }))) === "OverTotalCap");
  check("withdraw 1.00", (await code(c.withdraw(tusd("1")))) === "ok");
  check("withdraw beyond idle", (await code(c.withdraw(tusd("4.80")))) === "InsufficientLiquidity");

  await c.resetDemo("scenario");
  const steps = await c.getDemoSteps();
  check("scenario preset: 10 steps done", steps.filter((s) => s.status === "done").length === 10);
  const rs = await c.getReceivables();
  check("scenario preset: INV-002 Created, INV-001 Funded", rs.map((x) => `${x.invoiceNumber}:${x.state}`).join() === "INV-002:Created,INV-001:Funded", rs.map((x) => `${x.invoiceNumber}:${x.state}`).join());

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error("CRASH", e);
  process.exit(1);
});
