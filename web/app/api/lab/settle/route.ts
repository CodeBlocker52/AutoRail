import { json, fail, isHex32 } from "@/lib/server/http";
import { labAutoPay, sweepAutoPay } from "@/lib/server/autopay";
import { clientIp, limited } from "@/lib/server/store";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST { receivableId } → Frontier Lab auto-pays that invoice if it's due (Funded ≥ AUTOPAY_DELAY_SECONDS, onboarded vendor,
 * ≤ 0.10 tUSD8, within the daily caps). Answers { status: "paid" | "wait" | "already" | "skipped", … }. The Vendor screen
 * polls it after funding.
 */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { receivableId?: unknown };
    if (!isHex32(b.receivableId)) return json({ code: "BadRequest", message: "receivableId must be a bytes32 hex string." }, 400);
    if (await limited(`settle:ip:${clientIp(req)}`, 30, 600)) return json({ code: "RateLimited", message: "Too many requests. Try again in a few minutes." }, 429);
    return json(await labAutoPay(b.receivableId));
  } catch (e) {
    return fail(e, "lab.settle");
  }
}

/**
 * GET → sweep: pay every due auto-pay invoice (at most 3 per call). Called by Vercel Cron (Authorization: Bearer
 * $CRON_SECRET skips the rate limit) and safe for anyone to call: it only settles invoices that are already due.
 */
export async function GET(req: Request) {
  try {
    const cron = !!process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
    if (!cron && (await limited(`settle:sweep:${clientIp(req)}`, 6, 600))) return json({ code: "RateLimited", message: "Too many requests." }, 429);
    return json(await sweepAutoPay());
  } catch (e) {
    return fail(e, "lab.sweep");
  }
}
