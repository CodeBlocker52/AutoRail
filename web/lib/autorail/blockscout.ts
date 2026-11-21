/**
 * Blockscout (explorer-test.qday.info) API helpers: fast log backfill and the failed (reverted) txs of a JobWallet.
 * Reverted transactions emit no events, so blocked agent attempts come from here (isError = 1).
 */
import type { Address, Hash, Hex, Log } from "viem";
import { AEVUM_EXPLORER_URL } from "../chain/aevum";

const API = `${AEVUM_EXPLORER_URL}/api`;

interface BsLog {
  address: string;
  blockNumber: string;
  data: string;
  logIndex: string;
  timeStamp: string;
  topics: (string | null)[];
  transactionHash: string;
  transactionIndex: string;
}

async function get<T>(params: Record<string, string>): Promise<T> {
  const url = `${API}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`blockscout ${res.status}`);
  const body = (await res.json()) as { status: string; message: string; result: T };
  if (body.status !== "1" && !/no (logs|transactions) found/i.test(body.message)) throw new Error(`blockscout: ${body.message}`);
  return (body.result ?? []) as T;
}

/** All logs of `address` in [from, to], paged by block (Blockscout returns ≤1,000 per call). */
export async function blockscoutLogs(address: Address, from: bigint, to: bigint): Promise<(Log & { timeStamp?: number })[]> {
  const out: (Log & { timeStamp?: number })[] = [];
  let start = from;
  for (let page = 0; page < 200 && start <= to; page++) {
    const rows = await get<BsLog[]>({ module: "logs", action: "getLogs", address, fromBlock: String(start), toBlock: String(to) });
    for (const r of rows) {
      out.push({
        address: r.address as Address,
        blockNumber: BigInt(r.blockNumber),
        data: r.data as Hex,
        logIndex: Number(BigInt(r.logIndex)),
        topics: r.topics.filter((t): t is string => !!t) as [Hex, ...Hex[]],
        transactionHash: r.transactionHash as Hash,
        transactionIndex: Number(BigInt(r.transactionIndex)),
        blockHash: null,
        removed: false,
        timeStamp: Number(BigInt(r.timeStamp)),
      } as unknown as Log & { timeStamp?: number });
    }
    if (rows.length < 1000) break;
    start = BigInt(rows[rows.length - 1].blockNumber); // same-block duplicates are de-duplicated by the indexer
    if (rows.length && BigInt(rows[0].blockNumber) === start) start += 1n; // a single block with ≥1,000 logs
  }
  return out;
}

export interface BsTx {
  hash: Hash;
  blockNumber: string;
  timeStamp: string;
  from: Address;
  to: Address;
  input: Hex;
  isError: string;
  gasUsed: string;
}

/** Transactions sent to `address` (newest first). */
export function blockscoutTxs(address: Address): Promise<BsTx[]> {
  return get<BsTx[]>({ module: "account", action: "txlist", address, sort: "desc" });
}
