import "server-only";

const SECRET = /(0x)?[0-9a-fA-F]{64}(?![0-9a-fA-F])/g; // anything shaped like a private key

/** Structured JSON log line. Strips anything that looks like a 32-byte key (tx hashes too, so pass them as fields). */
export function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (/key|secret|signature|sig$/i.test(k)) continue;
    safe[k] = typeof v === "bigint" ? v.toString() : typeof v === "string" && !/hash|tx|address|wallet|from|to|id$/i.test(k) ? v.replace(SECRET, "[redacted]") : v;
  }
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...safe });
  if (level === "error") console.error(line);
  else console.log(line);
}
