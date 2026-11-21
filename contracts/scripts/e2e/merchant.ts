/**
 * Kestrel GPU: a local x402-style merchant. Settlement happens on Aevum in tUSD8 (only Aevum activity counts).
 *   1. Request without payment → HTTP 402 { price, asset, payTo, requestId, chainId }
 *   2. The payout agent pays the JobWallet → merchant with memo = requestId (a mined `Paid` event)
 *   3. Request again with `X-PAYMENT: <txHash>` → merchant verifies the event onchain → HTTP 200 + result
 * The merchant only accepts payments from genuine Autorail JobWallets (checked against the factory).
 */
import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import { decodeEventLog, type Address, type Hex, type PublicClient } from "viem";
import { abi, withRetry, type Deployment } from "./lib";

interface Quote {
  requestId: Hex;
  price: bigint;
  paidBy?: Hex;
}

export async function startMerchant(client: PublicClient, chainId: number, d: Deployment, merchant: Address, price: bigint) {
  const quotes = new Map<string, Quote>();
  const usedTx = new Set<string>();
  const server: Server = createServer(async (req, res) => {
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
    };
    try {
      if (!req.url?.startsWith("/v1/gpu/jobs")) return send(404, { error: "not found" });
      const payment = req.headers["x-payment"] as string | undefined;
      const rid = req.headers["x-request-id"] as string | undefined;
      if (!payment || !rid) {
        const q: Quote = { requestId: `0x${randomBytes(32).toString("hex")}`, price };
        quotes.set(q.requestId, q);
        return send(402, {
          error: "Payment Required",
          x402: { scheme: "autorail-jobwallet", network: `eip155:${chainId}`, asset: d.tUSD8, payTo: merchant, maxAmountRequired: price, requestId: q.requestId },
        });
      }
      const q = quotes.get(rid);
      if (!q) return send(400, { error: "unknown requestId" });
      if (usedTx.has(payment.toLowerCase())) return send(409, { error: "payment already used" });
      const receipt = await withRetry("merchant receipt", () => client.getTransactionReceipt({ hash: payment as Hex }));
      if (receipt.status !== "success") return send(402, { error: "payment tx reverted" });
      for (const log of receipt.logs) {
        try {
          const ev = decodeEventLog({ abi: abi.jobWallet, data: log.data, topics: log.topics });
          if (ev.eventName !== "Paid") continue;
          const a = ev.args as unknown as { payee: Address; amount: bigint; memo: Hex };
          if (a.payee.toLowerCase() !== merchant.toLowerCase() || a.amount < q.price || a.memo !== q.requestId) continue;
          // genuine Autorail JobWallet?
          const rec = (await client.readContract({ address: log.address, abi: abi.jobWallet, functionName: "receivableId" })) as Hex;
          const wallet = (await client.readContract({ address: d.factory, abi: abi.factory, functionName: "walletOf", args: [rec] })) as Address;
          if (wallet.toLowerCase() !== log.address.toLowerCase()) continue;
          usedTx.add(payment.toLowerCase());
          q.paidBy = payment as Hex;
          return send(200, { requestId: q.requestId, job: "job_4471", status: "complete", result: "s3://kestrel-gpu/results/job_4471.tar", paidTx: payment, jobWallet: log.address });
        } catch {
          /* not a JobWallet event */
        }
      }
      return send(402, { error: "no matching Paid event for this requestId" });
    } catch (e) {
      return send(500, { error: String((e as Error).message) });
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}/v1/gpu/jobs`, close: () => new Promise<void>((r) => server.close(() => r())) };
}
