import { json, fail } from "@/lib/server/http";
import { latestRepaid } from "@/lib/server/proof";

export const runtime = "nodejs";

/** GET → the latest real RepaymentRouter `Repaid` event (with its ERC-8004 NewFeedback), cached ~15 s per instance. */
export async function GET() {
  try {
    const r = await latestRepaid();
    return r ? json(r) : json({ code: "NotFound", message: "No repayment yet." }, 404);
  } catch (e) {
    return fail(e, "proof");
  }
}
