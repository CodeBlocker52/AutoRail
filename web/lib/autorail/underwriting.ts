/**
 * Deterministic underwriting: reads the seller's credit record (CreditFacility), the buyer tier (AutorailRoles),
 * the seller's ERC-8004 reputation summary and the facility's onchain `quote`, then builds an Offer inside the
 * RiskPricing bounds the facility re-checks. Shared by /api/underwrite (which signs) and the UI (which displays).
 * Rules decide; the text only explains.
 */
import type { Address, Hex, PublicClient } from "viem";
import { autorailRolesAbi, creditFacilityAbi, receivableRegistryAbi, reputationRegistryAbi } from "./generated/abis";
import { BAND_BY_INDEX, toAgentId } from "./mapping";
import { formatAmount } from "./format";
import type { RiskBand } from "./types";

export interface Offer {
  receivableId: Hex;
  advanceAmount: bigint;
  feeBps: number;
  payees: Address[];
  offerExpiry: bigint;
  nonce: bigint;
}

export interface Quote {
  offer: Offer;
  band: RiskBand;
  maxAdvanceBps: number;
  sellerLimit: bigint;
  vendorScore: number;
  feedbackCount: number;
  buyerTier: number;
  termDays: number;
  sellerAgentId: number;
  explanation: string;
}

export interface UnderwritingAddresses {
  registry: Address;
  facility: Address;
  roles: Address;
  reputation: Address;
  router: Address;
}

export const OFFER_TYPES = {
  Offer: [
    { name: "receivableId", type: "bytes32" },
    { name: "advanceAmount", type: "uint256" },
    { name: "feeBps", type: "uint16" },
    { name: "payees", type: "address[]" },
    { name: "offerExpiry", type: "uint64" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

const fmt = (v: bigint) => formatAmount(v);

/**
 * @param targetAdvanceBps advance the vendor asks for (capped by the band and the seller's limit)
 * @param payees approved payees for the job (bound into the signed offer)
 */
export async function buildQuote(
  client: PublicClient,
  c: UnderwritingAddresses,
  receivableId: Hex,
  payees: Address[],
  targetAdvanceBps = 7_500,
  now = BigInt(Math.floor(Date.now() / 1000)),
): Promise<Quote> {
  const r = (await client.readContract({ address: c.registry, abi: receivableRegistryAbi, functionName: "get", args: [receivableId] })) as {
    sellerAgentId: bigint;
    buyerAgentId: bigint;
    amount: bigint;
    dueDate: bigint;
    createdAt: bigint;
  };
  const [credit, tier, summary, quote] = await Promise.all([
    client.readContract({ address: c.facility, abi: creditFacilityAbi, functionName: "creditOf", args: [r.sellerAgentId] }),
    client.readContract({ address: c.roles, abi: autorailRolesAbi, functionName: "buyerTier", args: [r.buyerAgentId] }),
    client.readContract({
      address: c.reputation,
      abi: reputationRegistryAbi,
      functionName: "getSummary",
      args: [r.sellerAgentId, [c.router, c.facility], "credit", ""],
    }),
    client.readContract({ address: c.facility, abi: creditFacilityAbi, functionName: "quote", args: [receivableId] }),
  ]);
  const [terms, maxAdvance] = quote as unknown as [{ band: number; maxAdvanceBps: number; feeBps: number; sellerLimit: bigint }, bigint];
  const cr = credit as unknown as { onTime: number; late: number; defaults: number };
  const [count, avg] = summary as unknown as [bigint, bigint, number];

  const wanted = (r.amount * BigInt(targetAdvanceBps)) / 10_000n;
  const advanceAmount = wanted < maxAdvance ? wanted : maxAdvance;
  const band = BAND_BY_INDEX[Number(terms.band)];
  const termDays = Math.max(1, Math.round(Number(r.dueDate - r.createdAt) / 86_400));
  const history = cr.onTime + cr.late;
  const vendorScore = count > 0n ? Number(avg) : 50;
  const sellerAgentId = toAgentId(r.sellerAgentId)!;
  const explanation =
    advanceAmount === 0n
      ? `Band ${band}: no advance is available for this invoice${cr.defaults ? " because the vendor has a default on record" : ""}.`
      : `Seller agent #${sellerAgentId} has ${history === 0 ? "no repayment history yet" : `${cr.onTime} on-time and ${cr.late} late repayment${history > 1 ? "s" : ""}`}` +
        ` (ERC-8004: ${count} feedback, average ${count > 0n ? avg : "n/a"}). The buyer is tier ${tier}, and its signed confirmation names the Autorail router as payee, so the payment can't be redirected.` +
        ` That puts it in band ${band}: up to ${Number(terms.maxAdvanceBps) / 100}% at a ${Number(terms.feeBps) / 100}% fee, within a ${fmt(terms.sellerLimit)} tUSD8 seller limit.` +
        ` Offer: ${fmt(advanceAmount)} tUSD8 over ${termDays} days. Repaying on time raises the limit by 0.50.`;

  return {
    offer: {
      receivableId,
      advanceAmount,
      feeBps: Number(terms.feeBps),
      payees,
      offerExpiry: now + 3600n,
      nonce: now * 1_000_000n + BigInt(Math.floor(Math.random() * 1_000_000)),
    },
    band,
    maxAdvanceBps: Number(terms.maxAdvanceBps),
    sellerLimit: terms.sellerLimit,
    vendorScore,
    feedbackCount: Number(count),
    buyerTier: Number(tier),
    termDays,
    sellerAgentId,
    explanation,
  };
}
