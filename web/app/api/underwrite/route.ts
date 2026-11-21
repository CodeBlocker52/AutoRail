import { json, fail, isHex32 } from "@/lib/server/http";
import { underwrite } from "@/lib/server/ops";
import { clientIp, limited } from "@/lib/server/store";

export const runtime = "nodejs";

/**
 * POST { receivableId, advanceBps? } → { offer, signature, explanation, band, ... }
 * The deterministic underwriting agent: reads the credit record, buyer tier and ERC-8004 getSummary, then signs an
 * EIP-712 Offer inside the RiskPricing bounds (the CreditFacility re-checks them). The seller submits it with `fund`.
 */
export async function POST(req: Request) {
  try {
    if (await limited(`uw:ip:${clientIp(req)}`, 20)) return json({ code: "RateLimited", message: "Too many requests. Wait a minute." }, 429);
    const b = (await req.json()) as { receivableId?: unknown; advanceBps?: unknown };
    if (!isHex32(b.receivableId)) return json({ code: "BadRequest", message: "receivableId must be a bytes32 hex string." }, 400);
    const bps = typeof b.advanceBps === "number" && b.advanceBps > 0 && b.advanceBps <= 8000 ? b.advanceBps : 7500;
    return json(await underwrite(b.receivableId, bps));
  } catch (e) {
    return fail(e, "underwrite");
  }
}
