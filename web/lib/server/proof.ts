import "server-only";
import type { Address } from "viem";
import { LogIndexer } from "@/lib/autorail/indexer";
import { blockscoutLogs } from "@/lib/autorail/blockscout";
import { isLiveAevum } from "@/lib/chain/aevum";
import { deployment, publicClient } from "./chain";

let indexer: LogIndexer | null = null;

/** Server-side read model (one per instance), used by /api/proof. */
export function serverIndexer() {
  if (!indexer) {
    const d = deployment();
    const c = d.contracts as Record<string, Address>;
    indexer = new LogIndexer(publicClient(), {
      deployBlock: BigInt(d.deployBlock),
      core: [c.vault, c.registry, c.facility, c.factory, c.router, c.identity, c.reputation],
      factory: c.factory,
      history: isLiveAevum ? blockscoutLogs : undefined,
    });
  }
  return indexer;
}

export async function latestRepaid() {
  const idx = serverIndexer();
  await idx.fresh(15_000);
  const router = (deployment().contracts as Record<string, Address>).router.toLowerCase();
  const all = idx.byName("Repaid").filter((l) => l.address === router);
  const last = all.at(-1);
  if (!last) return null;
  const ts = await idx.timestamps([last.blockNumber]);
  const a = last.args as { id: string; from: Address; vaultAmount: bigint; sellerAmount: bigint; swept: bigint; onTime: boolean };
  const fb = idx.logs.find((l) => l.transactionHash === last.transactionHash && l.eventName === "NewFeedback");
  return {
    receivableId: a.id,
    from: a.from,
    vaultAmount: a.vaultAmount,
    sellerAmount: a.sellerAmount,
    swept: a.swept,
    onTime: a.onTime,
    txHash: last.transactionHash,
    block: last.blockNumber,
    timestamp: ts(last.blockNumber),
    feedback: fb ? { agentId: Number((fb.args as { agentId: bigint }).agentId), value: String((fb.args as { value: bigint }).value) } : null,
    totalRepaid: all.length,
    invoiceNumber: `INV-${String(idx.byName("ReceivableCreated").findIndex((l) => String(l.args.id).toLowerCase() === a.id.toLowerCase()) + 1).padStart(3, "0")}`,
  };
}
