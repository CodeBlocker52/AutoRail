/**
 * Abuse caps and the kill switch for every route that spends our gas or tUSD8.
 *
 * - DEMO_PAUSED=true → every spending route answers 503 "paused" (reads keep working).
 * - Global daily caps (UTC day), env-configurable; per-vendor and per-IP caps where it matters.
 * - Counters live in the shared store (Upstash in production), chain-scoped, so all serverless instances agree.
 *
 * Pure helpers take the store as a parameter so they can be unit-tested with the memory store.
 */
import type { KV } from "./store";

export class CapError extends Error {
  constructor(
    public code: "Paused" | "DailyCapReached" | "VendorCapReached" | "HourlyCapReached",
    message: string,
  ) {
    super(message);
  }
}

const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 && process.env[name] !== "" && process.env[name] !== undefined ? v : fallback;
};

/** Limits (read per call so tests and redeploys can change them). */
export function limits() {
  return {
    onboard: num("CAP_ONBOARD_DAILY", 40),
    drip: num("CAP_DRIP_DAILY", 25),
    autoConfirm: num("CAP_AUTOCONFIRM_DAILY", 30),
    autoPay: num("CAP_AUTOPAY_DAILY", 10),
    autoPayPerVendor: num("CAP_AUTOPAY_VENDOR_DAILY", 2),
    runLive: num("CAP_RUNLIVE_DAILY", 6),
    runLivePerIpHour: num("CAP_RUNLIVE_IP_HOURLY", 1),
  };
}
export type CapName = "onboard" | "drip" | "autoConfirm" | "autoPay" | "runLive";

export const isPaused = () => process.env.DEMO_PAUSED === "true";
export const PAUSED_MESSAGE = "The live demo is paused right now. Browse the recorded run, use Demo data, or try again later.";

export function assertNotPaused() {
  if (isPaused()) throw new CapError("Paused", PAUSED_MESSAGE);
}

/** UTC day, e.g. 2026-11-24 */
export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const DAY = 86_400 + 3_600; // a little slack past midnight
const key = (chainId: number, name: string, scope = "all", t = Date.now()) => `cap:${chainId}:${name}:${scope}:${utcDay(t)}`;

const MESSAGES: Record<CapName, string> = {
  onboard: "Today's onboarding limit for the demo has been reached. Try again tomorrow (UTC), or explore with Demo data.",
  drip: "Today's gas-drip limit has been reached. Get tQDAY from https://faucet.qday.info/en",
  autoConfirm: "Frontier Lab has reached today's auto-confirm limit. Ask a lab wallet to confirm, or try again tomorrow (UTC).",
  autoPay: "Frontier Lab has reached today's auto-pay limit (testnet demo). The invoice stays Funded; a lab wallet can still pay it.",
  runLive: "Today's limit of live runs has been reached. Replay the recorded run instead.",
};

/**
 * Take one slot of a daily cap (and optionally a scoped sub-cap, e.g. per vendor). Throws CapError when over.
 * Returns a `release()` to give the slots back if the action then fails.
 */
export async function takeDaily(
  kv: KV,
  chainId: number,
  name: CapName,
  opts: { limit?: number; scope?: { id: string; limit: number; message: string } } = {},
) {
  const limit = opts.limit ?? limits()[name];
  const k = key(chainId, name);
  const n = await kv.incr(k, DAY);
  if (n > limit) {
    await kv.decr(k);
    throw new CapError("DailyCapReached", MESSAGES[name]);
  }
  let sk: string | null = null;
  if (opts.scope) {
    sk = key(chainId, name, opts.scope.id);
    const m = await kv.incr(sk, DAY);
    if (m > opts.scope.limit) {
      await kv.decr(sk);
      await kv.decr(k);
      throw new CapError("VendorCapReached", opts.scope.message);
    }
  }
  return {
    release: async () => {
      await kv.decr(k);
      if (sk) await kv.decr(sk);
    },
  };
}

/** Fixed-window hourly cap per scope (e.g. "Run live" per IP). */
export async function takeHourly(kv: KV, chainId: number, name: string, scopeId: string, limit: number, message: string) {
  const k = `cap:${chainId}:${name}:${scopeId}:h${Math.floor(Date.now() / 3_600_000)}`;
  const n = await kv.incr(k, 3_600);
  if (n > limit) {
    await kv.decr(k);
    throw new CapError("HourlyCapReached", message);
  }
}

/** Used / limit / remaining for /api/health. */
export async function usage(kv: KV, chainId: number) {
  const l = limits();
  const names: CapName[] = ["onboard", "drip", "autoConfirm", "autoPay", "runLive"];
  const out: Record<string, { limit: number; used: number; remaining: number }> = {};
  for (const n of names) {
    const used = Number((await kv.get<number>(key(chainId, n))) ?? 0);
    out[n] = { limit: l[n], used, remaining: Math.max(0, l[n] - used) };
  }
  return { day: utcDay(), paused: isPaused(), caps: out, perVendor: { autoPay: l.autoPayPerVendor }, perIpHour: { runLive: l.runLivePerIpHour } };
}
