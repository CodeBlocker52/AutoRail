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
    if (await limited(`drip:ip:${clientIp(req)}`, 3, 86_400)) return json({ code: "RateLimited", message: "The gas drip allows 3 wallets per network per day. Use https://faucet.qday.info/en" }, 429);
    return json(await drip(b.address));
  } catch (e) {
    return fail(e, "drip");
  }
}
