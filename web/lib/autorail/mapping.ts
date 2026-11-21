/**
 * Pure mapping between onchain data and the UI types. No network access, so it's unit-tested (vitest).
 *
 * Rules that bite:
 *  - ERC-8004 agent ids START AT 0. Never test them for truthiness (`if (agentId)` drops agent 0);
 *    use `isAgentId(x)` / `!== undefined`.
 *  - Receivable ids are bytes32 hex strings.
 *  - Amounts stay bigint (6 decimals) end to end.
 */
import type { ActivityEvent, ActivityType, AgentRole, Hash, ReceivableState, RiskBand } from "./types";

/** ReceivableRegistry.State: None, Created, Confirmed, Funded, Repaid, Overdue, Defaulted. */
const STATE_BY_INDEX = [undefined, "Created", "Confirmed", "Funded", "Repaid", "Overdue", "Defaulted"] as const;

export function stateName(index: number | bigint): ReceivableState {
  const s = STATE_BY_INDEX[Number(index)];
  if (!s) throw new Error(`unknown receivable state ${index}`);
  return s;
}

/** AutorailRoles.Role: None, Seller, Buyer, Underwriter, Payout, Merchant. */
const ROLE_BY_INDEX = [undefined, "seller", "buyer", "underwriter", "payout", "merchant"] as const;

export function roleName(index: number | bigint): AgentRole | undefined {
  return ROLE_BY_INDEX[Number(index)];
}

export const BAND_BY_INDEX: readonly RiskBand[] = ["A", "B", "C", "D"];

export const isAgentId = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0;

export function toAgentId(x: bigint | number | undefined | null): number | undefined {
  if (x === undefined || x === null) return undefined;
  const n = Number(x);
  return isAgentId(n) ? n : undefined;
}

/** Mirror of RiskPricing.sellerLimit: 1.50 + 0.50 per on-time repayment, capped at 5.00; 0 after a default. */
export function sellerLimit(onTime: number, defaults: number): bigint {
  if (defaults > 0) return 0n;
  const l = 1_500_000n + BigInt(onTime) * 500_000n;
  return l > 5_000_000n ? 5_000_000n : l;
}

// ─────────────────────────── ERC-8004 agent URIs ───────────────────────────

export interface AgentFile {
  name?: string;
  description?: string;
  image?: string;
  services?: { name: string; endpoint: string }[];
  x402Support?: boolean;
  registrations?: { agentId: number; agentRegistry: string }[];
  autorail?: { role?: string };
}

function decodeBase64(b64: string): string {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(b64, "base64").toString("utf8");
}

/** Parse a `data:application/json[;base64],…` agentURI (fully onchain registration file). */
export function parseAgentURI(uri: string | undefined): AgentFile | null {
  if (!uri) return null;
  try {
    if (uri.startsWith("data:application/json;base64,")) return JSON.parse(decodeBase64(uri.slice("data:application/json;base64,".length)));
    if (uri.startsWith("data:application/json,")) return JSON.parse(decodeURIComponent(uri.slice("data:application/json,".length)));
    if (uri.trim().startsWith("{")) return JSON.parse(uri);
  } catch {
    /* not JSON */
  }
  return null;
}

// ─────────────────────────── events → activity ───────────────────────────

export interface DecodedLog {
  eventName: string;
  args: Record<string, unknown>;
  address: string;
  blockNumber: number;
  transactionHash: Hash;
  logIndex: number;
}

export interface ActivityContext {
  /** receivable id → invoice label (e.g. "INV-001") */
  invoiceLabel: (id: string) => string;
  /** address → human label */
  label: (addr: string) => string;
  /** agent id → name */
  agentName: (id: number) => string;
  /** JobWallet address → receivable id */
  walletReceivable: (addr: string) => string | undefined;
  timestamp: (block: number) => number;
  fmt: (v: bigint) => string;
}

const A = (x: unknown) => String(x);
const B = (x: unknown) => BigInt(x as bigint);

/** Map one decoded Autorail event to an activity row. Returns null for events the UI doesn't show. */
export function toActivity(log: DecodedLog, ctx: ActivityContext): ActivityEvent | null {
  const a = log.args;
  const base = {
    id: `${log.transactionHash}:${log.logIndex}`,
    txHash: log.transactionHash,
    block: log.blockNumber,
    timestamp: ctx.timestamp(log.blockNumber),
  };
  const ev = (type: ActivityType, title: string, extra: Partial<ActivityEvent> = {}): ActivityEvent => ({
    ...base,
    type,
    title,
    status: "ok",
    ...extra,
  });
  switch (log.eventName) {
    case "Deposit":
      return ev("vault.deposit", `${ctx.label(A(a.owner))} deposited ${ctx.fmt(B(a.assets))} tUSD8`, {
        detail: `${ctx.fmt(B(a.shares) / 1_000_000n)} vault shares (×10⁶ precision)`,
        actor: ctx.label(A(a.owner)),
      });
    case "Withdraw":
      return ev("vault.withdraw", `${ctx.label(A(a.owner))} withdrew ${ctx.fmt(B(a.assets))} tUSD8`, { actor: ctx.label(A(a.owner)) });
    case "Registered": {
      const id = toAgentId(B(a.agentId))!;
      return ev("agent.registered", `Agent #${id} registered: ${ctx.agentName(id)}`, {
        detail: `ERC-8004 identity · owner ${ctx.label(A(a.owner))}`,
        agentId: id,
        actor: ctx.agentName(id),
      });
    }
    case "ReceivableCreated": {
      const id = A(a.id);
      return ev("invoice.created", `${ctx.invoiceLabel(id)} created for ${ctx.fmt(B(a.amount))} tUSD8`, {
        detail: `Seller agent #${toAgentId(B(a.sellerAgentId))} → buyer agent #${toAgentId(B(a.buyerAgentId))}`,
        receivableId: id,
        agentId: toAgentId(B(a.sellerAgentId)),
        actor: ctx.agentName(toAgentId(B(a.sellerAgentId))!),
      });
    }
    case "ReceivableConfirmed": {
      const id = A(a.id);
      return ev("invoice.confirmed", `${ctx.invoiceLabel(id)} confirmed by ${ctx.label(A(a.buyer))}`, {
        detail: "EIP-712 signature · payee = Autorail router",
        receivableId: id,
        actor: ctx.label(A(a.buyer)),
      });
    }
    case "Funded": {
      const id = A(a.id);
      return ev("advance.funded", `Advance funded: ${ctx.fmt(B(a.advance))} tUSD8 for ${ctx.invoiceLabel(id)}`, {
        detail: `fee ${ctx.fmt(B(a.fee))} tUSD8 → JobWallet ${A(a.jobWallet).slice(0, 10)}…`,
        receivableId: id,
        actor: "Underwriting agent → seller",
      });
    }
    case "MarkedOverdue":
      return ev("invoice.overdue", `${ctx.invoiceLabel(A(a.id))} marked overdue`, { receivableId: A(a.id), status: "info" });
    case "SessionGranted": {
      const rid = ctx.walletReceivable(log.address);
      return ev("session.granted", `Session granted to ${ctx.label(A(a.key))}`, {
        detail: `${(a.payees as unknown[]).length} payees · ${ctx.fmt(B(a.perTxCap))} per payment · ${ctx.fmt(B(a.totalCap))} total`,
        receivableId: rid,
        actor: "Seller",
      });
    }
    // The EVENT is SessionKeyRevoked (the custom ERROR is SessionRevoked).
    case "SessionKeyRevoked":
      return ev("session.revoked", `Session revoked: ${ctx.label(A(a.key))}`, {
        detail: "The key can no longer pay",
        status: "info",
        receivableId: ctx.walletReceivable(log.address),
        actor: "Seller",
      });
    case "Paid": {
      const memo = A(a.memo);
      return ev("payment.sent", `Paid ${ctx.fmt(B(a.amount))} tUSD8 → ${ctx.label(A(a.payee))}`, {
        detail: `memo ${memo.slice(0, 18)}… · by ${ctx.label(A(a.key))}`,
        receivableId: ctx.walletReceivable(log.address),
        actor: ctx.label(A(a.key)),
      });
    }
    case "Repaid":
      // RepaymentRouter.Repaid has an id; AutorailVault.Repaid (principal, fee) doesn't.
      if (a.id === undefined) return null;
      return ev(
        "invoice.repaid",
        `${ctx.invoiceLabel(A(a.id))} paid: ${ctx.fmt(B(a.vaultAmount) + B(a.sellerAmount))} tUSD8 ${a.onTime ? "(on time)" : "(late)"}`,
        {
          detail: `Vault +${ctx.fmt(B(a.vaultAmount))} · seller +${ctx.fmt(B(a.sellerAmount))} · ${ctx.fmt(B(a.swept))} unspent swept`,
          receivableId: A(a.id),
          actor: ctx.label(A(a.from)),
        },
      );
    case "NewFeedback": {
      const id = toAgentId(B(a.agentId))!;
      return ev("reputation.updated", `Reputation: ${ctx.agentName(id)} ${A(a.tag2).replace(/_/g, " ") || A(a.tag1)}`, {
        detail: `ERC-8004 feedback ${String(a.value)} from ${ctx.label(A(a.clientAddress))}`,
        agentId: id,
        actor: ctx.label(A(a.clientAddress)),
      });
    }
    case "Defaulted":
      return ev("invoice.repaid", `${ctx.invoiceLabel(A(a.id))} defaulted`, {
        detail: `${ctx.fmt(B(a.principal))} written off, ${ctx.fmt(B(a.recovered))} recovered`,
        status: "blocked",
        receivableId: A(a.id),
      });
    default:
      return null;
  }
}
