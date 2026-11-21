import { isHex } from "viem";
import { json, fail, isAddr, isHex32, isUint } from "@/lib/server/http";
import { relay } from "@/lib/server/ops";
import { clientIp, limited } from "@/lib/server/store";
import { account } from "@/lib/server/env";

export const runtime = "nodejs";

/** GET: is gasless payment available? */
export async function GET() {
  const relayer = account("RELAYER_PRIVATE_KEY");
  return json({ enabled: !!relayer, relayer: relayer?.address ?? null });
}

/**
 * POST { receivableId, from, value, validAfter, validBefore, nonce, signature }
 * Submits RepaymentRouter.payWithAuthorization for the buyer (who only signed). Returns { hash, block }.
 */
export async function POST(req: Request) {
  try {
    if (await limited(`relay:ip:${clientIp(req)}`, 10)) return json({ code: "RateLimited", message: "Too many requests. Wait a minute." }, 429);
    const b = (await req.json()) as Record<string, unknown>;
    if (!isHex32(b.receivableId) || !isAddr(b.from) || !isUint(b.value) || !isUint(b.validAfter) || !isUint(b.validBefore) || !isHex32(b.nonce) || !(typeof b.signature === "string" && isHex(b.signature))) {
      return json({ code: "BadRequest", message: "Malformed payment request." }, 400);
    }
    if (await limited(`relay:payer:${String(b.from).toLowerCase()}`, 3)) return json({ code: "RateLimited", message: "Too many payments from this address. Wait a minute." }, 429);
    const sent = await relay({
      receivableId: b.receivableId,
      from: b.from,
      value: BigInt(b.value),
      validAfter: BigInt(b.validAfter),
      validBefore: BigInt(b.validBefore),
      nonce: b.nonce,
      signature: b.signature,
    });
    return json({ hash: sent.hash, block: sent.block });
  } catch (e) {
    return fail(e, "relay");
  }
}
