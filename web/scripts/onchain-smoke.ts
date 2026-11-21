/**
 * Read-only smoke test of the onchain client against the target chain (default Aevum 44005). Sends nothing.
 * Run: pnpm smoke:onchain
 */
import { OnchainAutorailClient } from "../lib/autorail/onchain";
import { formatAmount as f } from "../lib/autorail/format";

const RID = "0x345bd6f6c2da03cd2135e4821832026dd776bee228f0d001e6a1e0da2e557281";
let failures = 0;
const check = (label: string, ok: boolean, got?: unknown) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${got !== undefined ? `  (${String(got)})` : ""}`);
};

async function main() {
  const c = new OnchainAutorailClient();
  const t0 = Date.now();
  const agents = await c.getAgents();
  console.log(`indexed in ${Date.now() - t0} ms`);
  check("agents 0–4 with roles", agents.map((a) => a.agentId).join(",") === "0,1,2,3,4", agents.map((a) => `${a.agentId}:${a.role}:${a.name}`).join(" "));
  check("agent 0 is the seller", agents[0]?.role === "seller");
  check("seller reputation has on-time feedback", !!agents[0]?.reputation.some((r) => r.tag === "repaid_on_time"), agents[0]?.reputation.map((r) => r.tag).join(","));
  const recs = await c.getReceivables();
  check("recorded receivable present", recs.some((r) => r.id.toLowerCase() === RID), recs.map((r) => `${r.invoiceNumber}:${r.state}`).join(" "));
  const r = await c.getReceivable(RID);
  check("state Repaid", r?.state === "Repaid", r?.state);
  check("advance 1.20 band B", r?.advance?.advanceAmount === 1_200_000n && r.advance.riskBand === "B", `${r?.advance && f(r.advance.advanceAmount)} ${r?.advance?.riskBand}`);
  const jw = await c.getJobWallet(RID);
  check("job wallet", jw?.address === "0x23b164831b7E5b1b610992902b8130D78a3BEe49", jw?.address);
  const pays = await c.getPayments(jw!.address);
  const blocked = pays.filter((p) => p.status === "blocked");
  check("3 paid", pays.filter((p) => p.status === "paid").length === 3);
  check("3 blocked decoded", blocked.length === 3, blocked.map((b) => b.revertReason).join(" | "));
  const sessions = await c.getSessions(jw!.address);
  check("session revoked", sessions[0]?.revoked === true);
  const rep = await c.getRepayment(RID);
  check("repayment vault 1.224 seller 0.376 swept 0.1", rep?.vaultPrincipal === 1_200_000n && rep.vaultFee === 24_000n && rep.vendorRemainder === 376_000n && rep.unspentSwept === 100_000n);
  const act = await c.getActivity();
  check("activity has blocked + repaid", act.some((a) => a.type === "payment.blocked") && act.some((a) => a.type === "invoice.repaid"), act.length);
  const v = await c.getVaultStats();
  check("vault stats (fees ≥ the recorded run's 0.024; live runs add more)", v.totalAssets > 0n && v.feesEarned >= 24_000n, `${f(v.totalAssets)} fees ${f(v.feesEarned)} apy ${v.estApyBps}`);
  const steps = await c.getDemoSteps();
  check("recorded run order", steps.map((s) => s.id).join(",") === "1,2,3,4,5,6,7a,7b,7c,8,9,10a,10b,11,12");
  check("recorded steps all done", steps.every((s) => s.status === "done"));
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
