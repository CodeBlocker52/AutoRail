import type { ReputationEntry, RiskBand } from "./types";
import { ONE_TUSD8 } from "./format";

/**
 * Mirror of RiskPricing.sol (pure rules). The underwriting agent applies these
 * deterministically; the LLM only writes the explanation.
 */
export const MAX_ADVANCE_BPS = 8_000;
export const NEW_AGENT_SCORE = 50;

export interface Pricing {
  band: RiskBand;
  advanceBps: number;
  feeBps: number;
}

export function priceAdvance(vendorScore: number, buyerTier: 1 | 2 | 3): Pricing {
  if (vendorScore >= 80 && buyerTier === 1) return { band: "A", advanceBps: 8_000, feeBps: 150 };
  if (vendorScore >= 50 && buyerTier <= 2) return { band: "B", advanceBps: 7_500, feeBps: 200 };
  if (vendorScore >= 30) return { band: "C", advanceBps: 6_000, feeBps: 350 };
  return { band: "D", advanceBps: 0, feeBps: 0 };
}

/** Vendor advance limit grows with score: score × 0.10 tUSD8 (demo-sized). */
export const advanceLimitFor = (score: number) => (BigInt(score) * ONE_TUSD8) / 10n;

export function nextScore(prev: number, tag: ReputationEntry["tag"]): number {
  switch (tag) {
    case "repaid_on_time":
      return Math.min(100, prev + 15);
    case "repaid_late":
      return Math.max(0, prev - 10);
    case "defaulted":
      return Math.max(0, prev - 40);
    default:
      return prev;
  }
}

export const currentScore = (rep: ReputationEntry[]) => (rep.length ? rep[rep.length - 1].score : NEW_AGENT_SCORE);
