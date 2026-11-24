import { keccak256, toHex, type Hex } from "viem";
import { json, fail, isAddr, isUint } from "@/lib/server/http";
import { runPayout, type PayoutLine } from "@/lib/server/ops";
import { clientIp, limited } from "@/lib/server/store";

import { assertNotPaused } from "@/lib/server/caps";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST { jobWallet, lines: [{ payee, amount, memo, note? }], idempotencyKey }
 * The payout agent pays each line with its scoped session key. Lines the contract refuses are still sent
 * (real mined reverts) and returned with the decoded error, e.g. the prompt-injected 0xBAD… line.
 */
export async function POST(req: Request) {
  try {
    assertNotPaused();
    if (await limited(`payout:ip:${clientIp(req)}`, 6)) return json({ code: "RateLimited", message: "Too many requests. Wait a minute." }, 429);
    const b = (await req.json()) as { jobWallet?: unknown; lines?: unknown; idempotencyKey?: unknown };
    if (!isAddr(b.jobWallet) || !Array.isArray(b.lines) || b.lines.length === 0 || b.lines.length > 6) {
      return json({ code: "BadRequest", message: "Provide a jobWallet and 1–6 lines." }, 400);
    }
    if (typeof b.idempotencyKey !== "string" || b.idempotencyKey.length < 8 || b.idempotencyKey.length > 80) {
      return json({ code: "BadRequest", message: "idempotencyKey (8–80 chars) is required." }, 400);
    }
    const lines: PayoutLine[] = [];
    for (const l of b.lines as Record<string, unknown>[]) {
      if (!isAddr(l.payee) || !isUint(l.amount)) return json({ code: "BadRequest", message: "Each line needs payee and amount." }, 400);
      const memo = typeof l.memo === "string" && /^0x[0-9a-fA-F]{64}$/.test(l.memo) ? (l.memo as Hex) : keccak256(toHex(String(l.memo ?? "")));
      lines.push({ payee: l.payee, amount: BigInt(l.amount), memo, note: typeof l.note === "string" ? l.note.slice(0, 200) : undefined });
    }
    return json({ results: await runPayout(b.jobWallet, lines, b.idempotencyKey) });
  } catch (e) {
    return fail(e, "payout");
  }
}
