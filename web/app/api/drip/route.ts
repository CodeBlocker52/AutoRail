import { json, fail, isAddr } from "@/lib/server/http";
import { drip } from "@/lib/server/onboard";
import { clientIp, limited } from "@/lib/server/store";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST { address } → 0.02 tQDAY once per wallet if it holds < 0.01 tQDAY (capped). No tUSD8: use https://faucet.qday.info/en */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { address?: unknown };
    if (!isAddr(b.address)) return json({ code: "BadRequest", message: "address is required." }, 400);
    if (await limited(`drip:calls:${clientIp(req)}`, 30, 3600)) return json({ code: "RateLimited", message: "Too many requests. Try again later." }, 429);
    const ip = clientIp(req);
    return json(await drip(b.address, () => limited(`drip:ip:${ip}`, 3, 86_400)));
  } catch (e) {
    return fail(e, "drip");
  }
}
