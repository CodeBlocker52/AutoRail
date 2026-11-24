import "server-only";
import { NextResponse } from "next/server";
import { decodeError } from "@/lib/autorail/errors";
import { ServerConfigError } from "./env";
import { OpError } from "./ops";
import { log } from "./log";
import { CapError } from "./caps";

export const json = (body: unknown, status = 200) =>
  new NextResponse(JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/** Errors → `{ code, message, txHash? }`. Never includes stack traces or keys. */
export function fail(e: unknown, route: string) {
  if (e instanceof CapError) {
    log("warn", `${route}.capped`, { code: e.code });
    return json({ code: e.code, message: e.message }, e.code === "Paused" ? 503 : 429);
  }
  if (e instanceof OpError) {
    log("warn", `${route}.refused`, { code: e.code, txHash: e.txHash });
    return json({ code: e.code, message: e.message, txHash: e.txHash }, e.status);
  }
  if (e instanceof ServerConfigError) {
    log("error", `${route}.config`, { message: e.message });
    return json({ code: "NotConfigured", message: "This server action isn't configured right now." }, 503);
  }
  const d = decodeError(e);
  log("error", `${route}.error`, { code: d.code, raw: d.raw?.slice(0, 200) });
  if (/insufficient funds/i.test(d.raw ?? "")) return json({ code: "ServerOutOfGas", message: "The server wallet is out of tQDAY for gas." }, 503);
  return json({ code: d.code, message: d.message, txHash: d.txHash }, d.code === "Unknown" ? 500 : 400);
}

export const isHex32 = (v: unknown): v is `0x${string}` => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
export const isAddr = (v: unknown): v is `0x${string}` => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
export const isUint = (v: unknown): v is string => typeof v === "string" && /^\d{1,78}$/.test(v);
