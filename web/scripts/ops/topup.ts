/**
 * Ops top-up for the live demo. RUN LOCALLY ONLY (it reads the deployer key from contracts/.env); never on the server.
 *
 *   pnpm ops:topup                 # dry run: prints the plan and current balances
 *   pnpm ops:topup --execute       # sends
 *
 * 1. tQDAY from the DEPLOYER: drip → 1.0, relayer / payout / buyer (Frontier Lab) / roles operator / underwriter → 0.5 each.
 * 2. recycle-to-treasury: spare tUSD8 from demo accounts that only ever RECEIVE (annotators, merchant, demo seller)
 *    → the lab treasury (BUYER, pays auto-pays and Run live) and the demo LENDER (Run live deposit).
 *    Hard budget: --max-tusd8 (default 0.6). Targets: --treasury (default 0.40) and --lender (default 0.20).
 * 3. QA wallets (addresses from web/.env.qa): tQDAY ≥ 0.05 each from the deployer, and tUSD8 for one `pnpm qa:api` run
 *    (QA_LENDER --qa-lender 0.05, QA_LAB --qa-lab 0.10) from the same recycled sources and budget. Skip with --no-qa.
 * Prints balances before and after.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, createWalletClient, formatEther, formatUnits, http, parseEther, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { aevumTestnet } from "../../lib/chain/aevum";
import { DEPLOYMENTS } from "../../lib/autorail/generated/deployments";

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const MAX_TUSD8 = parseUnits(opt("max-tusd8", "0.6"), 6);
const TREASURY_TARGET = parseUnits(opt("treasury", "0.40"), 6);
const LENDER_TARGET = parseUnits(opt("lender", "0.20"), 6);
const WITH_QA = !args.includes("--no-qa");
const QA_LENDER_TARGET = parseUnits(opt("qa-lender", "0.05"), 6);
const QA_LAB_TARGET = parseUnits(opt("qa-lab", "0.10"), 6);
const QA_GAS = parseEther("0.05");
/** QA burner addresses only (keys are never read here). */
const qaEnv = (() => {
  try {
    return readFileSync(join(__dirname, "../../.env.qa"), "utf8");
  } catch {
    return "";
  }
})();
const qaAddr = (n: string) => qaEnv.match(new RegExp(`^${n}_ADDRESS=(0x[0-9a-fA-F]{40})`, "m"))?.[1] as Address | undefined;
const QA = ["QA_LENDER", "QA_VENDOR", "QA_LAB"].map((n) => [n, qaAddr(n)] as const).filter((x): x is readonly [string, Address] => !!x[1]);
const GAS_TARGETS: [string, string][] = [
  ["DRIP", "1.0"],
  ["RELAYER", "0.5"],
  ["PAYOUT_SESSION", "0.5"],
  ["BUYER", "0.5"],
  ["ROLES_OPERATOR", "0.5"],
  ["UNDERWRITER", "0.5"],
];
/** Accounts that only receive tUSD8 in the demo: safe to recycle from, in this order. Keep a little tQDAY on them. */
const RECYCLE_FROM = ["ANNOTATOR_A", "ANNOTATOR_B", "MERCHANT", "SELLER"];

const env = readFileSync(join(__dirname, "../../../contracts/.env"), "utf8");
const pk = (name: string) => env.match(new RegExp(`^${name}_PRIVATE_KEY=(0x)?([0-9a-fA-F]{64})`, "m"))?.[2];
const acct = (name: string): PrivateKeyAccount => {
  const k = pk(name);
  if (!k) throw new Error(`${name}_PRIVATE_KEY missing in contracts/.env`);
  return privateKeyToAccount(`0x${k}` as Hex);
};
const T = DEPLOYMENTS[44005].tUSD8 as Address;
const ERC20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;
const pc = createPublicClient({ chain: aevumTestnet, transport: http() });
const usd = (a: Address) => pc.readContract({ address: T, abi: ERC20, functionName: "balanceOf", args: [a] }) as Promise<bigint>;

async function table(title: string) {
  const names = ["DEPLOYER", ...GAS_TARGETS.map(([n]) => n), "LENDER", ...RECYCLE_FROM];
  console.log(`\n${title}`);
  for (const n of [...new Set(names)]) {
    const a = acct(n).address;
    const [g, u] = await Promise.all([pc.getBalance({ address: a }), usd(a)]);
    console.log(`  ${n.padEnd(16)} ${a}  tQDAY ${Number(formatEther(g)).toFixed(4).padStart(9)}  tUSD8 ${formatUnits(u, 6)}`);
  }
  if (WITH_QA)
    for (const [n, a] of QA) {
      const [g, u] = await Promise.all([pc.getBalance({ address: a }), usd(a)]);
      console.log(`  ${n.padEnd(16)} ${a}  tQDAY ${Number(formatEther(g)).toFixed(4).padStart(9)}  tUSD8 ${formatUnits(u, 6)}`);
    }
}

async function send(from: PrivateKeyAccount, label: string, tx: { to: Address; value?: bigint; data?: Hex } | { token: true; to: Address; amount: bigint }) {
  if (!EXECUTE) return console.log(`  [dry run] ${label}`);
  const wc = createWalletClient({ account: from, chain: aevumTestnet, transport: http() });
  const hash =
    "token" in tx
      ? await wc.writeContract({ address: T, abi: ERC20, functionName: "transfer", args: [tx.to, tx.amount], chain: aevumTestnet, type: "legacy" })
      : await wc.sendTransaction({ to: tx.to, value: tx.value, chain: aevumTestnet, type: "legacy" });
  const r = await pc.waitForTransactionReceipt({ hash });
  console.log(`  ${r.status === "success" ? "✓" : "✗"} ${label}  https://explorer-test.qday.info/tx/${hash}`);
  if (r.status !== "success") throw new Error(`${label} reverted`);
}

async function main() {
  console.log(`Autorail ops top-up · Aevum 44005 · ${EXECUTE ? "EXECUTE" : "DRY RUN (add --execute to send)"}`);
  await table("Before:");

  // 1 · gas from the deployer
  console.log("\n1 · tQDAY top-ups from the deployer");
  const deployer = acct("DEPLOYER");
  let gasTotal = 0n;
  for (const [name, target] of GAS_TARGETS) {
    const a = acct(name).address;
    const want = parseEther(target);
    const have = await pc.getBalance({ address: a });
    if (have >= want) {
      console.log(`  ${name} already has ${formatEther(have)} (target ${target})`);
      continue;
    }
    gasTotal += want - have;
    await send(deployer, `deployer → ${name}: ${formatEther(want - have)} tQDAY (to ${target})`, { to: a, value: want - have });
  }
  if (WITH_QA)
    for (const [name, a] of QA) {
      const have = await pc.getBalance({ address: a });
      if (have >= QA_GAS) {
        console.log(`  ${name} already has ${formatEther(have)} (target ${formatEther(QA_GAS)})`);
        continue;
      }
      gasTotal += QA_GAS - have;
      await send(deployer, `deployer → ${name}: ${formatEther(QA_GAS - have)} tQDAY (to ${formatEther(QA_GAS)})`, { to: a, value: QA_GAS - have });
    }
  console.log(`  total tQDAY from the deployer: ${formatEther(gasTotal)}`);

  // 2 · recycle spare tUSD8 into the lab treasury and the demo lender (hard budget)
  console.log(`\n2 · recycle-to-treasury (budget ${formatUnits(MAX_TUSD8, 6)} tUSD8)`);
  const treasury = acct("BUYER").address;
  const lender = acct("LENDER").address;
  const needs: [string, Address, bigint][] = [
    ["lab treasury (BUYER)", treasury, TREASURY_TARGET - (await usd(treasury))],
    ["demo LENDER", lender, LENDER_TARGET - (await usd(lender))],
  ];
  if (WITH_QA) {
    const ql = QA.find(([n]) => n === "QA_LENDER")?.[1];
    const qb = QA.find(([n]) => n === "QA_LAB")?.[1];
    if (ql) needs.push(["QA_LENDER", ql, QA_LENDER_TARGET - (await usd(ql))]);
    if (qb) needs.push(["QA_LAB", qb, QA_LAB_TARGET - (await usd(qb))]);
  }
  let budget = MAX_TUSD8;
  const sources = await Promise.all(RECYCLE_FROM.map(async (n) => ({ n, a: acct(n), bal: await usd(acct(n).address) })));
  let moved = 0n;
  for (const [label, to, needRaw] of needs) {
    let need = needRaw > 0n ? needRaw : 0n;
    if (need === 0n) console.log(`  ${label} is already at its target`);
    for (const s of sources) {
      if (need === 0n || budget === 0n) break;
      const amt = [need, s.bal, budget].reduce((m, v) => (v < m ? v : m));
      if (amt <= 0n) continue;
      await send(s.a, `${s.n} → ${label}: ${formatUnits(amt, 6)} tUSD8`, { token: true, to, amount: amt });
      s.bal -= amt;
      need -= amt;
      budget -= amt;
      moved += amt;
    }
    if (need > 0n) console.log(`  ${label}: ${formatUnits(need, 6)} tUSD8 short (budget or sources exhausted)`);
  }
  console.log(`  total tUSD8 moved: ${formatUnits(moved, 6)} (budget ${formatUnits(MAX_TUSD8, 6)})`);

  await table(EXECUTE ? "After:" : "After (unchanged: dry run):");
}

main().catch((e) => {
  console.error("FATAL", String((e as Error).message ?? e).slice(0, 300));
  process.exit(1);
});
