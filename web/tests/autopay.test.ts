import { describe, expect, it } from "vitest";
import { AUTO_PAY_MAX, decideAutoPay, type AutoPayInput } from "@/lib/server/autopayRules";

const base: AutoPayInput = {
  state: "Funded",
  buyerAgentId: 1n,
  labAgentId: 1n,
  amount: 100_000n,
  sellerOnboarded: true,
  fundedAt: 1_000,
  now: 1_060,
  delaySeconds: 60,
};

describe("Frontier Lab auto-pay rules", () => {
  it("pays an onboarded vendor's Funded ≤ 0.10 invoice to our lab once the delay has passed", () => {
    expect(decideAutoPay(base)).toEqual({ action: "pay" });
    expect(AUTO_PAY_MAX).toBe(100_000n);
  });
  it("waits until ~60 s after funding, telling the client when to come back", () => {
    expect(decideAutoPay({ ...base, now: 1_010 })).toEqual({ action: "wait", retryInSeconds: 50 });
  });
  it("is idempotent: an already-repaid invoice is reported, not paid again", () => {
    expect(decideAutoPay({ ...base, state: "Repaid" })).toEqual({ action: "already", state: "Repaid" });
  });
  it("skips invoices to other labs, from non-onboarded vendors, above 0.10, or not yet funded", () => {
    expect(decideAutoPay({ ...base, buyerAgentId: 7n })).toMatchObject({ action: "skip", code: "NotOurLab" });
    expect(decideAutoPay({ ...base, sellerOnboarded: false })).toMatchObject({ action: "skip", code: "SellerNotOnboarded" });
    expect(decideAutoPay({ ...base, amount: 100_001n })).toMatchObject({ action: "skip", code: "OverAutoPayCap" });
    expect(decideAutoPay({ ...base, state: "Confirmed", fundedAt: 0 })).toMatchObject({ action: "skip", code: "NotFunded" });
    expect(decideAutoPay({ ...base, state: "Defaulted" })).toMatchObject({ action: "skip", code: "NotPayable" });
  });
  it("checks ownership before timing: a non-lab invoice is skipped even if it's 'due'", () => {
    expect(decideAutoPay({ ...base, buyerAgentId: 2n, now: 999_999 })).toMatchObject({ action: "skip" });
  });
});
