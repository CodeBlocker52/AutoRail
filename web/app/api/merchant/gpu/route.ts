import { json, fail, isHex32 } from "@/lib/server/http";
import { merchantQuote, merchantVerify } from "@/lib/server/ops";
import { clientIp, limited } from "@/lib/server/store";

export const runtime = "nodejs";

/**
 * Kestrel GPU, the demo x402-style merchant. Settles in tUSD8 on Aevum.
 *  - POST without payment → 402 { x402: { maxAmountRequired, payTo, requestId, asset, network } }
 *  - POST with headers X-PAYMENT: <txHash> and X-Request-Id: <requestId> → verifies the JobWallet Paid
 *    event (memo = requestId) onchain → 200 { result }
 */
export async function POST(req: Request) {
  try {
    if (await limited(`gpu:ip:${clientIp(req)}`, 30)) return json({ code: "RateLimited", message: "Too many requests." }, 429);
    const payment = req.headers.get("x-payment");
    const requestId = req.headers.get("x-request-id");
    if (!payment || !requestId) return json(await merchantQuote(), 402);
    if (!isHex32(payment) || !isHex32(requestId)) return json({ code: "BadRequest", message: "X-PAYMENT and X-Request-Id must be 32-byte hex." }, 400);
    return json(await merchantVerify(requestId, payment));
  } catch (e) {
    return fail(e, "merchant");
  }
}
