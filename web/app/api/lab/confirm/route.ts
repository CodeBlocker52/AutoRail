import { json, fail, isHex32 } from "@/lib/server/http";
import { labAutoConfirm } from "@/lib/server/onboard";
import { clientIp, limited } from "@/lib/server/store";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST { receivableId } → our Frontier Lab agent confirms an onboarded vendor's invoice (≤ 0.20 tUSD8) with EIP-712. */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { receivableId?: unknown };
    if (!isHex32(b.receivableId)) return json({ code: "BadRequest", message: "receivableId must be a bytes32 hex string." }, 400);
    if (await limited(`labconfirm:ip:${clientIp(req)}`, 10, 3600)) return json({ code: "RateLimited", message: "Too many confirmation requests. Try again later." }, 429);
    return json(await labAutoConfirm(b.receivableId));
  } catch (e) {
    return fail(e, "lab.confirm");
  }
}
