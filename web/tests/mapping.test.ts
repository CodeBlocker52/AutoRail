import { describe, expect, it } from "vitest";
import { encodeErrorResult, encodeFunctionData, type Hash } from "viem";
import { isAgentId, parseAgentURI, roleName, sellerLimit, stateName, toActivity, toAgentId, type ActivityContext, type DecodedLog } from "@/lib/autorail/mapping";
import { formatAmount, parseTokenInput, tusd } from "@/lib/autorail/format";
import { AutorailError, decodeError, decodeRevertData, ERROR_MESSAGES } from "@/lib/autorail/errors";
import { jobWalletAbi } from "@/lib/autorail/generated/abis";

describe("agent ids start at 0", () => {
  it("treats 0 as a real agent id (no truthy checks)", () => {
    expect(isAgentId(0)).toBe(true);
    expect(toAgentId(0n)).toBe(0);
    expect(toAgentId(4n)).toBe(4);
    expect(toAgentId(undefined)).toBeUndefined();
    expect(isAgentId(-1)).toBe(false);
    expect(isAgentId(1.5)).toBe(false);
  });
  it("keeps agent 0 in activity rows", () => {
    const ctx = makeCtx();
    const row = toActivity(log("Registered", { agentId: 0n, agentURI: "", owner: "0x2366C8cAD102855a028F0eA78C9C15e84dB9B98D" }), ctx)!;
    expect(row.agentId).toBe(0);
    expect(row.title).toContain("Agent #0");
  });
});

describe("bigint amounts (6 decimals)", () => {
  it("formats and parses without floating point", () => {
    expect(formatAmount(1_224_000n)).toBe("1.224");
    expect(formatAmount(1_224_000n, { maxFrac: 2 })).toBe("1.22");
    expect(formatAmount(0n)).toBe("0.00");
    expect(formatAmount(1_000_000_000_000n)).toBe("1,000,000.00");
    expect(formatAmount(-5_000n, { maxFrac: 3 })).toBe("−0.005");
    expect(formatAmount(999_999n)).toBe("0.999999");
    expect(formatAmount(999_999n, { maxFrac: 2 })).toBe("1.00");
    expect(tusd("0.08")).toBe(80_000n);
    expect(parseTokenInput("0.123456")).toBe(123_456n);
    expect(parseTokenInput("0.1234567")).toBeNull();
    expect(parseTokenInput("abc")).toBeNull();
    // larger than Number.MAX_SAFE_INTEGER survives
    expect(formatAmount(9_007_199_254_740_993_000_000n, { maxFrac: 6 })).toBe("9,007,199,254,740,993.00");
  });
});

describe("small amounts show up to 6 decimals, never 0.00", () => {
  it("formats fees and dust exactly, trimming trailing zeros to 2", () => {
    expect(formatAmount(3_000n)).toBe("0.003"); // the 2% fee on a 0.15 advance
    expect(formatAmount(1_500n)).toBe("0.0015");
    expect(formatAmount(1n)).toBe("0.000001");
    expect(formatAmount(75_000n)).toBe("0.075");
    expect(formatAmount(1_200_000n)).toBe("1.20");
    expect(formatAmount(100_000n)).toBe("0.10");
    expect(formatAmount(0n)).toBe("0.00");
    expect(formatAmount(-3_000n)).toBe("−0.003");
    expect(formatAmount(3_000n, { sign: true })).toBe("+0.003");
    for (const v of [1n, 9n, 10n, 999n, 3_000n, 45_123n]) expect(formatAmount(v)).not.toBe("0.00");
  });
  it("tQDAY (18 decimals) can still be capped explicitly", () => {
    expect(formatAmount(298_765_432_100_000_000n, { decimals: 18, maxFrac: 3 })).toBe("0.299");
  });
});

describe("state and role mapping", () => {
  it("maps the contract enums exactly", () => {
    expect([1, 2, 3, 4, 5, 6].map(stateName)).toEqual(["Created", "Confirmed", "Funded", "Repaid", "Overdue", "Defaulted"]);
    expect(() => stateName(0)).toThrow();
    expect(() => stateName(7)).toThrow();
    expect([0, 1, 2, 3, 4, 5].map(roleName)).toEqual([undefined, "seller", "buyer", "underwriter", "payout", "merchant"]);
  });
  it("seller limit follows the pricing rule", () => {
    expect(sellerLimit(0, 0)).toBe(1_500_000n);
    expect(sellerLimit(1, 0)).toBe(2_000_000n);
    expect(sellerLimit(20, 0)).toBe(5_000_000n);
    expect(sellerLimit(3, 1)).toBe(0n);
  });
});

describe("event mapping", () => {
  const ctx = makeCtx();
  it("SessionKeyRevoked is the EVENT (SessionRevoked is the error)", () => {
    const row = toActivity(log("SessionKeyRevoked", { key: "0xf6D2c420C783F3e8c4cF26B50De564cB9dB25614" }), ctx)!; // gitleaks:allow (public session-key address, not a secret)
    expect(row.type).toBe("session.revoked");
    expect(toActivity(log("SessionRevoked", {}), ctx)).toBeNull();
  });
  it("router Repaid maps; vault Repaid (no id) is skipped", () => {
    const r = toActivity(log("Repaid", { id: RID, from: "0x7e2248174a3D12C0cb64465c041C512C45b9246b", vaultAmount: 1_224_000n, sellerAmount: 376_000n, swept: 100_000n, onTime: true }), ctx)!;
    expect(r.type).toBe("invoice.repaid");
    expect(r.title).toBe("INV-001 paid: 1.60 tUSD8 (on time)");
    expect(r.receivableId).toBe(RID);
    expect(toActivity(log("Repaid", { principal: 1n, fee: 1n }), ctx)).toBeNull();
  });
  it("NewFeedback carries agent 0", () => {
    const r = toActivity(log("NewFeedback", { agentId: 0n, clientAddress: "0x9857f243990Df645bdf43F165188DFFE162D40C7", value: 100n, tag1: "credit", tag2: "repaid_on_time" }), ctx)!;
    expect(r.type).toBe("reputation.updated");
    expect(r.agentId).toBe(0);
  });
  it("parses base64 and plain data-URI agent files", () => {
    const json = JSON.stringify({ name: "Lumen Data" });
    expect(parseAgentURI(`data:application/json;base64,${Buffer.from(json).toString("base64")}`)?.name).toBe("Lumen Data");
    expect(parseAgentURI(`data:application/json,${encodeURIComponent(json)}`)?.name).toBe("Lumen Data");
    expect(parseAgentURI("ipfs://x")).toBeNull();
  });
});

describe("error decoding with the generated ABIs", () => {
  it("decodes custom errors from raw revert data", () => {
    const data = encodeErrorResult({ abi: jobWalletAbi, errorName: "PayeeNotAllowed", args: ["0x3a01A37ee421C1485726B361F401cfc2C08Be03f"] });
    expect(decodeRevertData(data)?.name).toBe("PayeeNotAllowed");
    expect(decodeError({ data }).code).toBe("PayeeNotAllowed");
    expect(decodeError({ data }).message).toBe(ERROR_MESSAGES.PayeeNotAllowed);
  });
  it("SessionRevoked and OverPerTxCap have plain-English messages", () => {
    for (const name of ["SessionRevoked", "OverPerTxCap"] as const) {
      const data = encodeErrorResult({ abi: jobWalletAbi, errorName: name, args: name === "OverPerTxCap" ? [40_000n, 30_000n] : [] } as never);
      expect(decodeError({ data }).code).toBe(name);
    }
  });
  it("handles API payloads, wallet rejection and AutorailError", () => {
    expect(decodeError({ code: "InvalidSignature", message: "x" }).code).toBe("InvalidSignature");
    expect(decodeError({ code: "RateLimited", message: "Too many requests." }).message).toBe("Too many requests.");
    expect(decodeError({ code: 4001, message: "User rejected the request." }).code).toBe("UserRejected");
    expect(decodeError(new AutorailError("WrongChain")).code).toBe("WrongChain");
    expect(decodeError({ message: "FiatTokenV2: authorization is expired" }).message).toMatch(/expired/);
  });
  it("garbage data is not a match", () => {
    expect(decodeRevertData("0xdeadbeef")).toBeNull();
    expect(decodeRevertData(encodeFunctionData({ abi: jobWalletAbi, functionName: "closed" }))).toBeNull();
  });
});

const RID = "0x345bd6f6c2da03cd2135e4821832026dd776bee228f0d001e6a1e0da2e557281";
function log(eventName: string, args: Record<string, unknown>): DecodedLog {
  return { eventName, args, address: "0x0000000000000000000000000000000000000001", blockNumber: 10, transactionHash: `0x${"ab".repeat(32)}` as Hash, logIndex: 0 };
}
function makeCtx(): ActivityContext {
  return {
    invoiceLabel: (id) => (id === RID ? "INV-001" : "INV-?"),
    label: (a) => a.slice(0, 6),
    agentName: (id) => `Agent ${id}`,
    walletReceivable: () => RID,
    timestamp: () => 1_795_270_993,
    fmt: (v) => formatAmount(v),
  };
}
