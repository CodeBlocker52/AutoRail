import "server-only";
import { formatUnits, getAddress, type Address, type Hash, type Hex } from "viem";
import { creditFacilityAbi, receivableRegistryAbi, repaymentRouterAbi } from "@/lib/autorail/generated/abis";
import { stateName } from "@/lib/autorail/mapping";
import { RECEIVE_TYPES, tusd8Domain } from "@/lib/autorail/tokenDomain";
import { TARGET_CHAIN_ID } from "@/lib/chain/aevum";
import { requireAccount } from "./env";
import { deployment, publicClient } from "./chain";
import { OpError, relay } from "./ops";
import { store } from "./store";
import { assertNotPaused, CapError, limits, takeDaily } from "./caps";
import { log } from "./log";
import { decideAutoPay, AUTO_PAY_MAX, type AutoPayDecision } from "./autopayRules";

export { decideAutoPay, AUTO_PAY_MAX };

const ERC20_BAL = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const;
const c = () => deployment().contracts as Record<string, Address>;
export const autoPayDelaySeconds = () => Number(process.env.AUTOPAY_DELAY_SECONDS ?? 60);
/** tUSD8 the lab treasury always keeps for one "Run live" cycle (the buyer key pays 0.10 there). */
export const labTreasuryReserve = () => BigInt(process.env.LAB_TREASURY_RESERVE ?? 100_000);

export type AutoPayResult =
  | { status: "paid"; txHash: Hash; block: number; amount: string }
  | { status: "already"; state: string }
  | { status: "wait"; retryInSeconds: number }
  | { status: "skipped"; code: string; message: string };

/**
 * "Frontier Lab auto-pays": our buyer agent (#1) repays an onboarded vendor's Funded invoice (≤ 0.10 tUSD8) about a
 * minute after funding, with its own EIP-3009 signature submitted through the normal relay rails. Idempotent per
 * invoice; capped per day globally and per vendor; never dips into the Run-live reserve of the lab treasury.
 */
export async function labAutoPay(receivableId: Hex): Promise<AutoPayResult> {
  assertNotPaused();
  const client = publicClient();
  const d = deployment();
  const r = (await client.readContract({ address: c().registry, abi: receivableRegistryAbi, functionName: "get", args: [receivableId] }).catch(() => null)) as
    | { buyer: Address; sellerAgentId: bigint; buyerAgentId: bigint; amount: bigint; state: number }
    | null;
  if (!r || r.state === 0) throw new OpError("UnknownReceivable", "Unknown invoice.", 404);
  const adv = (await client.readContract({ address: c().facility, abi: creditFacilityAbi, functionName: "advanceOf", args: [receivableId] })) as { fundedAt: bigint };
  const onboarded = await store.get<{ role: string }>(`onboarded:${TARGET_CHAIN_ID}:${r.sellerAgentId}`);
  const decision: AutoPayDecision = decideAutoPay({
    state: stateName(r.state),
    buyerAgentId: r.buyerAgentId,
    labAgentId: BigInt(d.agents["frontier-lab"]),
    amount: r.amount,
    sellerOnboarded: onboarded?.role === "vendor",
    fundedAt: Number(adv.fundedAt),
    now: Math.floor(Date.now() / 1000),
    delaySeconds: autoPayDelaySeconds(),
  });
  if (decision.action === "already") return { status: "already", state: decision.state };
  if (decision.action === "wait") return { status: "wait", retryInSeconds: decision.retryInSeconds };
  if (decision.action === "skip") return { status: "skipped", code: decision.code, message: decision.message };

  const lab = requireAccount("BUYER_PRIVATE_KEY");
  if (getAddress(r.buyer) !== lab.address) return { status: "skipped", code: "NotOurLab", message: "This invoice wasn't confirmed by the Frontier Lab agent." };
  const treasury = (await client.readContract({ address: d.tUSD8, abi: ERC20_BAL, functionName: "balanceOf", args: [lab.address] })) as bigint;
  if (treasury < r.amount + labTreasuryReserve()) {
    return { status: "skipped", code: "TreasuryLow", message: "Frontier Lab's demo treasury is low right now. The invoice stays Funded; a lab wallet can still pay it." };
  }

  const doneKey = `autopay:done:${TARGET_CHAIN_ID}:${receivableId}`;
  if (!(await store.claim(doneKey, 30 * 86_400))) return { status: "wait", retryInSeconds: 15 }; // another instance is paying it
  let slot: { release: () => Promise<void> } | null = null;
  try {
    slot = await takeDaily(store, TARGET_CHAIN_ID, "autoPay", {
      scope: { id: `vendor-${r.sellerAgentId}`, limit: limits().autoPayPerVendor, message: `Frontier Lab auto-pays at most ${limits().autoPayPerVendor} invoices per vendor per day (testnet demo). This one stays Funded; a lab wallet can still pay it.` },
    });
    const nonce = (await client.readContract({ address: c().router, abi: repaymentRouterAbi, functionName: "authorizationNonce", args: [receivableId] })) as Hex;
    const validBefore = BigInt(Math.floor(Date.now() / 1000) + 1800);
    const signature = await lab.signTypedData({
      domain: await tusd8Domain(client, d.tUSD8, TARGET_CHAIN_ID),
      types: RECEIVE_TYPES,
      primaryType: "ReceiveWithAuthorization",
      message: { from: lab.address, to: c().router, value: r.amount, validAfter: 0n, validBefore, nonce },
    });
    const sent = await relay({ receivableId, from: lab.address, value: r.amount, validAfter: 0n, validBefore, nonce, signature });
    log("info", "lab.autopay", { receivableId, hash: sent.hash, amount: String(r.amount) });
    return { status: "paid", txHash: sent.hash, block: sent.block, amount: formatUnits(r.amount, 6) };
  } catch (e) {
    await store.del(doneKey);
    if (slot) await slot.release();
    if (e instanceof CapError) return { status: "skipped", code: e.code, message: e.message };
    if (e instanceof OpError && e.code === "AlreadyRepaid") return { status: "already", state: "Repaid" };
    throw e;
  }
}

/**
 * Safety net for vendors who close the tab: pay every due auto-pay invoice (Funded ≥ delay, to Frontier Lab,
 * onboarded vendor, ≤ 0.10). Bounded per call. Triggered by Vercel cron, the Vendor screen, or anyone (idempotent).
 */
export async function sweepAutoPay(max = 3) {
  assertNotPaused();
  const { serverIndexer } = await import("./proof");
  const idx = serverIndexer();
  await idx.fresh(15_000);
  const lab = BigInt(deployment().agents["frontier-lab"]);
  const created = new Map(idx.byName("ReceivableCreated").map((l) => [String(l.args.id).toLowerCase(), l.args as { buyerAgentId: bigint; amount: bigint }] as const));
  const repaid = new Set(idx.byName("Repaid").filter((l) => l.args.id !== undefined).map((l) => String(l.args.id).toLowerCase()));
  const candidates = idx
    .byName("Funded")
    .map((l) => String(l.args.id).toLowerCase())
    .filter((id) => !repaid.has(id) && created.get(id)?.buyerAgentId === lab && (created.get(id)?.amount ?? AUTO_PAY_MAX + 1n) <= AUTO_PAY_MAX)
    .slice(-20);
  const results: { receivableId: string; result: AutoPayResult | { status: "error"; message: string } }[] = [];
  let paid = 0;
  for (const id of candidates) {
    if (paid >= max) break;
    try {
      const res = await labAutoPay(id as Hex);
      results.push({ receivableId: id, result: res });
      if (res.status === "paid") paid++;
    } catch (e) {
      results.push({ receivableId: id, result: { status: "error", message: String((e as Error).message).slice(0, 120) } });
    }
  }
  return { checked: candidates.length, paid, results };
}
