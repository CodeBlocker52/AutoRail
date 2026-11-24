/**
 * Pure eligibility rules for "Frontier Lab auto-pays" (no I/O, unit-tested in tests/autopay.test.ts).
 */
export const AUTO_PAY_MAX = 100_000n; // 0.10 tUSD8 (same cap as auto-confirm)

export interface AutoPayInput {
  state: string;
  buyerAgentId: bigint;
  labAgentId: bigint;
  amount: bigint;
  sellerOnboarded: boolean;
  /** unix seconds the advance was funded (0 if never) */
  fundedAt: number;
  now: number;
  delaySeconds: number;
}

export type AutoPayDecision =
  | { action: "pay" }
  | { action: "already"; state: string }
  | { action: "wait"; retryInSeconds: number }
  | { action: "skip"; code: string; message: string };

export function decideAutoPay(i: AutoPayInput): AutoPayDecision {
  if (i.state === "Repaid") return { action: "already", state: "Repaid" };
  if (i.buyerAgentId !== i.labAgentId) return { action: "skip", code: "NotOurLab", message: "Only invoices addressed to the Frontier Lab agent are auto-paid." };
  if (!i.sellerOnboarded) return { action: "skip", code: "SellerNotOnboarded", message: "Auto-pay is for vendors onboarded through the app." };
  if (i.amount > AUTO_PAY_MAX) return { action: "skip", code: "OverAutoPayCap", message: "Frontier Lab auto-pays invoices up to 0.10 tUSD8 only." };
  if (i.state !== "Funded") {
    if (i.state === "Created" || i.state === "Confirmed") return { action: "skip", code: "NotFunded", message: "Accept the advance first: Frontier Lab pays once the invoice is Funded." };
    return { action: "skip", code: "NotPayable", message: `This invoice is ${i.state}; auto-pay only settles Funded invoices.` };
  }
  if (i.fundedAt <= 0) return { action: "skip", code: "NotFunded", message: "Accept the advance first." };
  const due = i.fundedAt + i.delaySeconds;
  if (i.now < due) return { action: "wait", retryInSeconds: due - i.now };
  return { action: "pay" };
}
