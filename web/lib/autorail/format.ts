import { parseUnits } from "viem";

export const TUSD8_DECIMALS = 6;
export const ONE_TUSD8 = 1_000_000n;

/** Parse a human amount ("4", "0.80") into 6-decimal bigint. */
export function tusd(value: string | number): bigint {
  return parseUnits(String(value), TUSD8_DECIMALS);
}

/**
 * Format a fixed-point bigint. Shows up to `maxFrac` decimals (default: all 6 of tUSD8) and trims trailing zeros
 * down to `minFrac` (default 2): 1_200_000n → "1.20", 3_000n → "0.003", 1_224_000n → "1.224". Small amounts are
 * never rounded away to "0.00".
 */
export function formatAmount(
  value: bigint,
  { decimals = TUSD8_DECIMALS, minFrac = 2, maxFrac = decimals, sign = false }: { decimals?: number; minFrac?: number; maxFrac?: number; sign?: boolean } = {},
): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  let whole = abs / base;
  let frac = abs % base;
  // round to maxFrac
  if (maxFrac < decimals) {
    const drop = 10n ** BigInt(decimals - maxFrac);
    const rounded = (frac + drop / 2n) / drop;
    const limit = 10n ** BigInt(maxFrac);
    if (rounded >= limit) {
      whole += 1n;
      frac = 0n;
    } else frac = rounded;
  }
  let fracStr = maxFrac === 0 ? "" : frac.toString().padStart(Math.min(maxFrac, decimals), "0");
  while (fracStr.length > minFrac && fracStr.endsWith("0")) fracStr = fracStr.slice(0, -1);
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const prefix = neg ? "−" : sign && value > 0n ? "+" : "";
  return `${prefix}${wholeStr}${fracStr ? "." + fracStr : ""}`;
}

/** Strict parser for user input. Returns null if invalid or over 6 decimals. */
export function parseTokenInput(input: string, decimals = TUSD8_DECIMALS): bigint | null {
  const s = input.trim();
  if (!s || !/^\d*\.?\d*$/.test(s) || s === ".") return null;
  const [w, f = ""] = s.split(".");
  if (f.length > decimals) return null;
  try {
    return parseUnits(`${w || "0"}.${f || "0"}`, decimals);
  } catch {
    return null;
  }
}

export const toInputString = (value: bigint, decimals = TUSD8_DECIMALS) =>
  formatAmount(value, { decimals, minFrac: 0, maxFrac: decimals }).replace(/,/g, "");

export const shortAddr = (a: string, head = 6, tail = 4) => (a.length <= head + tail + 2 ? a : `${a.slice(0, head)}…${a.slice(-tail)}`);
export const shortHash = (h: string) => shortAddr(h, 8, 6);

export const pct = (bps: number, digits = 0) => `${(bps / 100).toFixed(digits)}%`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function formatDateTime(ts: number): string {
  const d = new Date(ts * 1000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${hh}:${mm}:${ss}`;
}
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "22:44:17" for today, "20 Nov · 22:44:17" for other days. */
export function formatEventTime(ts: number, now = new Date()): string {
  const d = new Date(ts * 1000);
  return sameDay(d, now) ? formatTime(ts) : `${d.getDate()} ${MONTHS[d.getMonth()]} · ${formatTime(ts)}`;
}

/** Day label for grouping: "Today", "Yesterday" or "20 Nov 2026". */
export function formatDayLabel(ts: number, now = new Date()): string {
  const d = new Date(ts * 1000);
  if (sameDay(d, now)) return "Today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "Yesterday";
  return formatDate(ts);
}
export const dayKey = (ts: number) => {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
}

/** "2d 4h", "3h 12m", "45s". */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0s";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export function relativeTime(ts: number, now = Math.floor(Date.now() / 1000)): string {
  const diff = now - ts;
  if (diff < 0) return `in ${formatDuration(-diff)}`;
  if (diff < 10) return "just now";
  return `${formatDuration(diff).split(" ")[0]} ago`;
}

export const nowSec = () => Math.floor(Date.now() / 1000);

/** JSON.stringify that renders bigint as decimal strings. */
export const stringifyBig = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2);
