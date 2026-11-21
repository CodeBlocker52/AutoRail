import { json, fail, isAddr } from "@/lib/server/http";
import { blockedFor } from "@/lib/server/ops";

export const runtime = "nodejs";

/** GET ?wallet=0x… → blocked attempts recorded by our agent routes (fallback where the explorer API is unavailable). */
export async function GET(req: Request) {
  try {
    const w = new URL(req.url).searchParams.get("wallet");
    if (!isAddr(w)) return json({ code: "BadRequest", message: "wallet must be an address." }, 400);
    return json({ blocked: await blockedFor(w) });
  } catch (e) {
    return fail(e, "blocked");
  }
}
