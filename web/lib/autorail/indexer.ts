/**
 * Read model: every Autorail event, read with eth_getLogs in ≤1,000-block chunks from the deploy block
 * (Aevum: toBlock − fromBlock ≤ 1000), cached in memory with an incremental cursor.
 *
 * JobWallets are discovered from `JobWalletCreated`; each new wallet is backfilled from its creation block.
 */
import { decodeEventLog, type Abi, type Address, type Hash, type Log, type PublicClient } from "viem";
import * as abis from "./generated/abis";
import type { DecodedLog } from "./mapping";

const CHUNK = 1000n; // blocks per request (from..from+999 inclusive)
const CONCURRENCY = 3;

const EVENTS_ABI = Object.values(abis)
  .flat()
  .filter((x) => (x as { type: string }).type === "event") as unknown as Abi;

export interface IndexerConfig {
  deployBlock: bigint;
  core: Address[];
  factory: Address;
  /**
   * Optional fast backfill for long ranges (e.g. the Blockscout logs API). Ranges longer than
   * HISTORY_THRESHOLD are read through it, except the last CHUNK blocks, which always come from RPC.
   * Any failure falls back to chunked RPC.
   */
  history?: (address: Address, from: bigint, to: bigint) => Promise<(Log & { timeStamp?: number })[]>;
}

const HISTORY_THRESHOLD = 20n * CHUNK;

export class LogIndexer {
  logs: DecodedLog[] = [];
  /** last block fully scanned (inclusive) */
  cursor: bigint;
  readonly wallets = new Map<string, bigint>(); // JobWallet (lower-case) → creation block
  private seen = new Set<string>();
  private syncing: Promise<void> | null = null;
  private blockTime = new Map<number, number>();
  lastSyncAt = 0;

  constructor(
    private client: PublicClient,
    private cfg: IndexerConfig,
  ) {
    this.cursor = cfg.deployBlock - 1n;
  }

  /** Bring the cache up to the chain head. Concurrent callers share one sync. */
  sync(): Promise<void> {
    if (!this.syncing) {
      this.syncing = this.doSync().finally(() => {
        this.syncing = null;
        this.lastSyncAt = Date.now();
      });
    }
    return this.syncing;
  }

  /** Sync until the cache includes `block` (a pass already in flight may have started before it was mined). */
  async until(block: bigint | number, timeoutMs = 60_000) {
    const target = BigInt(block);
    const end = Date.now() + timeoutMs;
    while (this.cursor < target) {
      await this.sync();
      if (this.cursor >= target) break;
      if (Date.now() > end) throw new Error(`indexer: block ${target} not reached`);
      await new Promise((r) => setTimeout(r, 750));
    }
  }

  /** Sync only if the cache is older than `maxAgeMs`. */
  async fresh(maxAgeMs = 4_000) {
    if (Date.now() - this.lastSyncAt > maxAgeMs || this.logs.length === 0) await this.sync();
  }

  private async doSync() {
    const head = await this.client.getBlockNumber();
    if (head <= this.cursor) return;
    const from = this.cursor + 1n;
    const before = new Set(this.wallets.keys());
    await this.scan([...this.cfg.core, ...[...this.wallets.keys()].map((w) => w as Address)], from, head);
    // backfill wallets discovered in this pass (their logs before discovery weren't requested)
    const added = [...this.wallets.entries()].filter(([w]) => !before.has(w));
    for (const [w, created] of added) await this.scan([w as Address], created, head);
    this.cursor = head;
    this.logs.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  }

  private async scan(addresses: Address[], from: bigint, to: bigint) {
    if (this.cfg.history && to - from > HISTORY_THRESHOLD) {
      const histTo = to - CHUNK;
      try {
        for (const addr of addresses) {
          for (const l of await this.cfg.history(addr, from, histTo)) {
            if (l.timeStamp) this.blockTime.set(Number(l.blockNumber), l.timeStamp);
            this.ingest(l);
          }
        }
        from = histTo + 1n;
      } catch {
        /* fall back to chunked RPC for the whole range */
      }
    }
    const ranges: [bigint, bigint][] = [];
    for (let s = from; s <= to; s += CHUNK) ranges.push([s, s + CHUNK - 1n > to ? to : s + CHUNK - 1n]);
    for (let i = 0; i < ranges.length; i += CONCURRENCY) {
      const batch = ranges.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(([a, b]) => withRetry(() => this.client.getLogs({ address: addresses, fromBlock: a, toBlock: b }))),
      );
      for (const logs of results) for (const l of logs) this.ingest(l);
    }
  }

  private ingest(l: Log) {
    const key = `${l.transactionHash}:${l.logIndex}`;
    if (this.seen.has(key)) return;
    let decoded: { eventName: string; args: unknown };
    try {
      decoded = decodeEventLog({ abi: EVENTS_ABI, data: l.data, topics: l.topics }) as never;
    } catch {
      return; // not an Autorail event
    }
    this.seen.add(key);
    const args = (decoded.args ?? {}) as Record<string, unknown>;
    if (decoded.eventName === "JobWalletCreated" && l.address.toLowerCase() === this.cfg.factory.toLowerCase()) {
      this.wallets.set(String(args.wallet).toLowerCase(), l.blockNumber!);
    }
    this.logs.push({
      eventName: decoded.eventName,
      args,
      address: l.address.toLowerCase(),
      blockNumber: Number(l.blockNumber),
      transactionHash: l.transactionHash as Hash,
      logIndex: l.logIndex!,
    });
  }

  /** Block timestamps for the given blocks (cached). */
  async timestamps(blocks: number[]) {
    const missing = [...new Set(blocks)].filter((b) => !this.blockTime.has(b));
    for (let i = 0; i < missing.length; i += 6) {
      await Promise.all(
        missing.slice(i, i + 6).map(async (b) => {
          const blk = await withRetry(() => this.client.getBlock({ blockNumber: BigInt(b) }));
          this.blockTime.set(b, Number(blk.timestamp));
        }),
      );
    }
    return (b: number) => this.blockTime.get(b) ?? Math.floor(Date.now() / 1000);
  }

  byName(name: string) {
    return this.logs.filter((l) => l.eventName === name);
  }
}

const RETRYABLE = /(fetch failed|ECONNRESET|ETIMEDOUT|timed? ?out|took too long|429|502|503|504|header not found|HTTP request failed)/i;
/** Retry transient RPC failures with backoff. Never retries a revert. */
export async function withRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (i >= tries - 1 || !RETRYABLE.test(msg) || /revert/i.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
}
