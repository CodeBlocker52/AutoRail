/**
 * Underwriting agent (service). Reads the seller's credit record from the CreditFacility, the buyer tier from
 * AutorailRoles and the seller's ERC-8004 reputation summary, then signs an EIP-712 Offer inside the onchain
 * RiskPricing bounds (the facility re-checks everything). Deterministic rules; an LLM would only write `explanation`.
 */
import type { Address, Hex, PublicClient } from "viem";
import { abi, n, withRetry, type Actor, type Deployment } from "./lib";

export interface Offer {
  receivableId: Hex;
  advanceAmount: bigint;
  feeBps: number;
  payees: Address[];
  offerExpiry: bigint;
  nonce: bigint;
}

const BANDS = ["A", "B", "C", "D"];

export async function underwrite(
  client: PublicClient,
  chainId: number,
  d: Deployment,
  underwriter: Actor,
  receivableId: Hex,
  payees: Address[],
) {
  const r = (await withRetry("registry.get", () =>
    client.readContract({ address: d.registry, abi: abi.registry, functionName: "get", args: [receivableId] }),
  )) as { sellerAgentId: bigint; buyerAgentId: bigint; amount: bigint; dueDate: bigint };
  const credit = (await client.readContract({
    address: d.facility,
    abi: abi.facility,
    functionName: "creditOf",
    args: [r.sellerAgentId],
  })) as { onTime: number; late: number; defaults: number };
  const tier = (await client.readContract({ address: d.roles, abi: abi.roles, functionName: "buyerTier", args: [r.buyerAgentId] })) as number;
  const [count, summary] = (await client.readContract({
    address: d.reputation,
    abi: abi.reputation,
    functionName: "getSummary",
    args: [r.sellerAgentId, [d.router, d.facility], "credit", ""],
  })) as [bigint, bigint, number];
  const [terms, maxAdvance] = (await client.readContract({
    address: d.facility,
    abi: abi.facility,
    functionName: "quote",
    args: [receivableId],
  })) as [{ band: number; maxAdvanceBps: number; feeBps: number; sellerLimit: bigint }, bigint];

  const wanted = (r.amount * n("advanceBps")) / 10_000n;
  const advanceAmount = wanted < maxAdvance ? wanted : maxAdvance;
  if (advanceAmount === 0n) throw new Error(`underwriter: band ${BANDS[terms.band]}: no advance available`);

  const now = BigInt(Math.floor(Date.now() / 1000));
  const offer: Offer = {
    receivableId,
    advanceAmount,
    feeBps: terms.feeBps,
    payees,
    offerExpiry: now + 3600n,
    nonce: BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000)),
  };
  const signature = await underwriter.account.signTypedData({
    domain: { name: "Autorail CreditFacility", version: "1", chainId, verifyingContract: d.facility },
    types: {
      Offer: [
        { name: "receivableId", type: "bytes32" },
        { name: "advanceAmount", type: "uint256" },
        { name: "feeBps", type: "uint16" },
        { name: "payees", type: "address[]" },
        { name: "offerExpiry", type: "uint64" },
        { name: "nonce", type: "uint256" },
      ],
    },
    primaryType: "Offer",
    message: offer,
  });
  const history = credit.onTime + credit.late;
  const explanation =
    `Seller agent #${r.sellerAgentId}: ${history === 0 ? "no repayment history yet" : `${credit.onTime} on-time / ${credit.late} late`}` +
    `, ${credit.defaults} defaults; ERC-8004 feedback count ${count} (avg ${summary}). Buyer tier ${tier}. ` +
    `Band ${BANDS[terms.band]} → up to ${terms.maxAdvanceBps / 100}% at ${terms.feeBps / 100}%; seller limit ${Number(terms.sellerLimit) / 1e6} tUSD8. ` +
    `Offer: ${Number(advanceAmount) / 1e6} tUSD8. The router is the payee, so the lab's payment can't be redirected.`;
  return { offer, signature, explanation, band: BANDS[terms.band] };
}
