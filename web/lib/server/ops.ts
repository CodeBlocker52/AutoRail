import "server-only";
import { randomBytes } from "node:crypto";
import { decodeEventLog, getAddress, parseSignature, type Address, type Hash, type Hex } from "viem";
import { creditFacilityAbi, jobWalletAbi, jobWalletFactoryAbi, receivableRegistryAbi, repaymentRouterAbi } from "@/lib/autorail/generated/abis";
import { ADDRESS_LABELS, DEMO_ADDRESSES } from "@/lib/autorail/generated/labels";
import { buildQuote, OFFER_TYPES, type Offer } from "@/lib/autorail/underwriting";
import { stateName } from "@/lib/autorail/mapping";
import { TARGET_CHAIN_ID } from "@/lib/chain/aevum";
import { requireAccount } from "./env";
import { deployment, publicClient, revertReason, send, simulate, type Sent } from "./chain";
import { store } from "./store";
import { log } from "./log";

/** Errors returned to clients as `{ code, message, txHash? }` (decodeError understands this shape). */
export class OpError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public txHash?: Hash,
  ) {
    super(message);
  }
}

const contracts = () => deployment().contracts as Record<string, Address>;

/** Payees the underwriter will approve: the demo annotators and the GPU merchant. */
export function approvedPayees(): Address[] {
  return [DEMO_ADDRESSES.ANNOTATOR_A, DEMO_ADDRESSES.ANNOTATOR_B, DEMO_ADDRESSES.MERCHANT].map((a) => getAddress(a));
}

// ─────────────────────────── relayer ───────────────────────────

const MAX_WINDOW = 3600n;

export interface RelayRequest {
  receivableId: Hex;
  from: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
  signature: Hex;
}

/**
 * Gasless repayment. Rails (from Aevum Starter Kit's relay route, MIT, PQA Labs):
 * only RepaymentRouter.payWithAuthorization; only a Funded/Overdue receivable; value == invoice amount;
 * from == the confirming buyer; nonce == authorizationNonce(id); validBefore − now ≤ 1h; not repaid;
 * not already in flight; simulated before sending.
 */
export async function relay(req: RelayRequest, onHash?: (h: Hash) => void | Promise<void>): Promise<Sent> {
  const c = contracts();
  const client = publicClient();
  const r = (await client.readContract({ address: c.registry, abi: receivableRegistryAbi, functionName: "get", args: [req.receivableId] })) as {
    buyer: Address;
    amount: bigint;
    state: number;
  };
  const state = stateName(r.state);
  if (state === "Repaid") throw new OpError("AlreadyRepaid", "This invoice has already been repaid.", 409);
  if (state !== "Funded" && state !== "Overdue") throw new OpError("NotPayable", `This invoice can't be paid while ${state}.`);
  if (req.value !== r.amount) throw new OpError("WrongAmount", "The payment must equal the invoice amount.");
  if (getAddress(req.from) !== getAddress(r.buyer)) throw new OpError("NotBuyer", "Only the confirming buyer can pay.");
  const expected = (await client.readContract({ address: c.router, abi: repaymentRouterAbi, functionName: "authorizationNonce", args: [req.receivableId] })) as Hex;
  if (req.nonce !== expected) throw new OpError("WrongNonce", "The authorization nonce isn't bound to this invoice.");
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (req.validBefore - now > MAX_WINDOW) throw new OpError("WindowTooLong", "Signature window is too long (max 1 hour).");
  if (!(await store.claim(`relay:inflight:${TARGET_CHAIN_ID}:${req.receivableId}`, 120))) {
    throw new OpError("InFlight", "This invoice is already being submitted.", 409);
  }
  try {
    const { v, r: rr, s, yParity } = parseSignature(req.signature);
    const call = {
      address: c.router,
      abi: repaymentRouterAbi,
      functionName: "payWithAuthorization",
      args: [req.receivableId, req.from, req.value, req.validAfter, req.validBefore, req.nonce, v !== undefined ? Number(v) : 27 + (yParity ?? 0), rr, s],
    } as const;
    const relayer = requireAccount("RELAYER_PRIVATE_KEY");
    await simulate(relayer, call);
    const sent = await send(relayer, call, { onHash });
    if (sent.status !== "success") throw new OpError(sent.errorName ?? "Unknown", "The repayment reverted.", 400, sent.hash);
    return sent;
  } finally {
    await store.del(`relay:inflight:${TARGET_CHAIN_ID}:${req.receivableId}`);
  }
}

// ─────────────────────────── underwriter ───────────────────────────

export async function underwrite(receivableId: Hex, targetAdvanceBps = 7_500) {
  const c = contracts();
  const client = publicClient();
  const r = (await client.readContract({ address: c.registry, abi: receivableRegistryAbi, functionName: "get", args: [receivableId] })) as { state: number };
  const state = stateName(r.state);
  if (state === "Created") throw new OpError("NotConfirmed", "The buyer hasn't confirmed this invoice yet.");
  if (state !== "Confirmed") throw new OpError("InvalidState", `This invoice is already ${state}.`);
  const q = await buildQuote(client, { registry: c.registry, facility: c.facility, roles: c.roles, reputation: c.reputation, router: c.router }, receivableId, approvedPayees(), targetAdvanceBps);
  if (q.offer.advanceAmount === 0n) throw new OpError("AdvanceTooHigh", q.explanation);
  const signer = requireAccount("UNDERWRITER_PRIVATE_KEY");
  const signature = await signer.signTypedData({
    domain: { name: "Autorail CreditFacility", version: "1", chainId: TARGET_CHAIN_ID, verifyingContract: c.facility },
    types: OFFER_TYPES,
    primaryType: "Offer",
    message: q.offer,
  });
  log("info", "underwrite", { receivableId, band: q.band, advance: q.offer.advanceAmount });
  return { ...q, signature, underwriter: signer.address };
}

export function offerArgs(o: Offer) {
  return [{ ...o, feeBps: o.feeBps }] as const;
}

// ─────────────────────────── payout agent ───────────────────────────

export interface PayoutLine {
  payee: Address;
  amount: bigint;
  memo: Hex;
  /** Free text the agent read in the job notes (shown in the audit trail). */
  note?: string;
}

export interface PayoutResult {
  payee: Address;
  payeeLabel: string;
  amount: string;
  hash?: Hash;
  status: "paid" | "blocked" | "skipped";
  errorName?: string;
  block?: number;
  note?: string;
}

/**
 * The payout agent pays a job's lines with its session key. A line the contract would refuse is STILL sent
 * (explicit gas, so it's a real mined revert with a tx hash) and recorded, because blocked attempts are the
 * audit trail. Idempotent per `idempotencyKey` + line index.
 */
export async function runPayout(jobWallet: Address, lines: PayoutLine[], idempotencyKey: string): Promise<PayoutResult[]> {
  const agent = requireAccount("PAYOUT_SESSION_PRIVATE_KEY");
  const client = publicClient();
  // only wallets where the payout agent actually holds (or held) a session
  const session = (await client.readContract({ address: jobWallet, abi: jobWalletAbi, functionName: "sessionOf", args: [agent.address] })) as { exists: boolean };
  if (!session.exists) throw new OpError("NoSession", "The payout agent has no session on this JobWallet.");
  const results: PayoutResult[] = [];
  for (const [i, line] of lines.entries()) {
    const key = `payout:${TARGET_CHAIN_ID}:${idempotencyKey}:${i}`;
    const prev = await store.get<PayoutResult>(key);
    if (prev?.hash) {
      results.push({ ...prev, status: prev.status });
      continue;
    }
    const call = { address: jobWallet, abi: jobWalletAbi, functionName: "pay", args: [line.payee, line.amount, line.memo] } as const;
    let willRevert = false;
    try {
      await simulate(agent, call);
    } catch {
      willRevert = true;
    }
    const sent = await send(agent, call, {
      gas: willRevert ? 250_000n : undefined,
      onHash: (h) => store.set(key, { payee: line.payee, amount: line.amount.toString(), hash: h, status: "skipped" }, 86_400),
    });
    const res: PayoutResult = {
      payee: line.payee,
      payeeLabel: ADDRESS_LABELS[line.payee.toLowerCase()] ?? line.payee,
      amount: line.amount.toString(),
      hash: sent.hash,
      status: sent.status === "success" ? "paid" : "blocked",
      errorName: sent.errorName,
      block: sent.block,
      note: line.note,
    };
    await store.set(key, res, 86_400);
    if (res.status === "blocked") await recordBlocked(jobWallet, { ...res, from: agent.address, timestamp: Math.floor(Date.now() / 1000) });
    results.push(res);
  }
  return results;
}

export interface BlockedRecord extends PayoutResult {
  from: Address;
  timestamp: number;
}

/** Blocked attempts made by our own agent routes (used where the explorer API is unavailable, e.g. a local fork). */
export async function recordBlocked(jobWallet: Address, rec: BlockedRecord) {
  const key = `blocked:${TARGET_CHAIN_ID}:${jobWallet.toLowerCase()}`;
  const list = (await store.get<BlockedRecord[]>(key)) ?? [];
  if (!list.some((x) => x.hash === rec.hash)) list.push(rec);
  await store.set(key, list.slice(-200));
}

export async function blockedFor(jobWallet: Address) {
  return (await store.get<BlockedRecord[]>(`blocked:${TARGET_CHAIN_ID}:${jobWallet.toLowerCase()}`)) ?? [];
}

// ─────────────────────────── x402-style merchant ───────────────────────────

export const GPU_PRICE = 20_000n; // 0.02 tUSD8 per job (live profile)

export async function merchantQuote(price = GPU_PRICE) {
  const requestId = `0x${randomBytes(32).toString("hex")}` as Hex;
  await store.set(`x402:quote:${requestId}`, { price: price.toString() }, 3600);
  return {
    error: "Payment Required",
    x402: {
      scheme: "autorail-jobwallet",
      network: `eip155:${TARGET_CHAIN_ID}`,
      asset: deployment().tUSD8,
      payTo: getAddress(DEMO_ADDRESSES.MERCHANT),
      maxAmountRequired: price.toString(),
      requestId,
      merchant: "Kestrel GPU (demo merchant)",
    },
  };
}

/** Verify a payment: the tx must contain a JobWallet Paid(payee=merchant, amount≥price, memo=requestId) from a genuine Autorail JobWallet. */
export async function merchantVerify(requestId: Hex, txHash: Hash) {
  const quote = await store.get<{ price: string }>(`x402:quote:${requestId}`);
  if (!quote) throw new OpError("UnknownRequest", "Unknown or expired request id.", 400);
  if (!(await store.claim(`x402:used:${txHash.toLowerCase()}`, 86_400 * 30))) throw new OpError("PaymentUsed", "This payment was already used.", 409);
  const client = publicClient();
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new OpError("PaymentReverted", "The payment transaction reverted.", 402);
  const merchant = getAddress(DEMO_ADDRESSES.MERCHANT);
  for (const l of receipt.logs) {
    try {
      const ev = decodeEventLog({ abi: jobWalletAbi, data: l.data, topics: l.topics });
      if (ev.eventName !== "Paid") continue;
      const a = ev.args as unknown as { payee: Address; amount: bigint; memo: Hex };
      if (getAddress(a.payee) !== merchant || a.amount < BigInt(quote.price) || a.memo !== requestId) continue;
      const rid = (await client.readContract({ address: l.address, abi: jobWalletAbi, functionName: "receivableId" })) as Hex;
      const wallet = (await client.readContract({ address: contracts().factory, abi: jobWalletFactoryAbi, functionName: "walletOf", args: [rid] })) as Address;
      if (getAddress(wallet) !== getAddress(l.address)) continue;
      return { requestId, job: `job_${requestId.slice(2, 8)}`, status: "complete", result: `s3://kestrel-gpu/results/${requestId.slice(2, 10)}.tar`, paidTx: txHash, jobWallet: l.address };
    } catch {
      /* not a JobWallet event */
    }
  }
  await store.del(`x402:used:${txHash.toLowerCase()}`);
  throw new OpError("NoMatchingPayment", "No matching Paid event for this request id.", 402);
}

export { revertReason, creditFacilityAbi };
