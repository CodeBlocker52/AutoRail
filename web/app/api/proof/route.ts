import { json, fail } from "@/lib/server/http";
import { latestRepaid } from "@/lib/server/proof";

export const runtime = "nodejs";
export const maxDuration = 30;

/** GET → the latest real RepaymentRouter `Repaid` event (with its ERC-8004 NewFeedback), cached ~15 s per instance. */
export async function GET() {
  try {
    const r = await latestRepaid();
    if (!r) return json({ code: "NotFound", message: "No repayment yet." }, 404);
    // CDN-cached: a cold instance (indexer backfill) or a slow RPC call never reaches most visitors
    const res = json(r);
    res.headers.set("cache-control", "public, s-maxage=30, stale-while-revalidate=300");
    return res;
  } catch (e) {
    return fail(e, "proof");
  }
}
