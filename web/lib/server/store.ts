import "server-only";
import { Redis } from "@upstash/redis";
import { log } from "./log";
import { TARGET_CHAIN_ID } from "@/lib/chain/aevum";

/**
 * Shared key-value store for idempotency keys, rate limits and recorded blocked attempts.
 *
 * - **Upstash Redis** (Vercel KV is Upstash under the hood) when `KV_REST_API_URL` + `KV_REST_API_TOKEN` are set
 *   (or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`). Required on serverless: every instance must see the
 *   same idempotency keys and rate-limit counters.
 * - **In-memory** fallback otherwise: fine for `pnpm dev`, a single `next start`, and the fork e2e.
 *
 * Values are JSON (bigints as strings). Idempotency claims fail closed (a Redis error throws); rate limits fail open
 * (a Redis outage must not lock users out), with a warning in the logs.
 */
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export interface KV {
  readonly kind: "upstash" | "memory";
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  /** SET NX: true if this call claimed the key. */
  claim(key: string, ttlSeconds: number): Promise<boolean>;
  del(key: string): Promise<void>;
  /** Atomic INCR; the TTL is applied in the same round trip. */
  incr(key: string, ttlSeconds: number): Promise<number>;
  /** Give a slot back (e.g. a capped action that failed after counting). Never goes below 0. */
  decr(key: string): Promise<number>;
  /** Hash field write (one record per field, so concurrent writers never overwrite each other). */
  hset(key: string, field: string, value: unknown, ttlSeconds?: number): Promise<void>;
  hvals<T>(key: string): Promise<T[]>;
}

const enc = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
const dec = <T>(v: unknown): T | null => (v === null || v === undefined ? null : (JSON.parse(String(v)) as T));

export function upstashStore(redis: Redis): KV {
  return {
    kind: "upstash",
    async get<T>(key: string) {
      return dec<T>(await redis.get<string>(key));
    },
    async set(key, value, ttlSeconds = 0) {
      if (ttlSeconds) await redis.set(key, enc(value), { ex: ttlSeconds });
      else await redis.set(key, enc(value));
    },
    async claim(key, ttlSeconds) {
      return (await redis.set(key, "1", { nx: true, ex: ttlSeconds })) === "OK";
    },
    async del(key) {
      await redis.del(key);
    },
    async incr(key, ttlSeconds) {
      const [n] = await redis.multi().incr(key).expire(key, ttlSeconds).exec<[number, number]>();
      return Number(n);
    },
    async decr(key) {
      const n = Number(await redis.decr(key));
      if (n < 0) await redis.set(key, "0", { keepTtl: true });
      return Math.max(0, n);
    },
    async hset(key, field, value, ttlSeconds = 0) {
      const tx = redis.multi().hset(key, { [field]: enc(value) });
      if (ttlSeconds) tx.expire(key, ttlSeconds);
      await tx.exec();
    },
    async hvals<T>(key: string) {
      return ((await redis.hvals(key)) as unknown[]).map((v) => dec<T>(v)!).filter((v) => v !== null);
    },
  };
}

export function memoryStore(): KV {
  const mem = new Map<string, { v: string; exp: number }>();
  const hashes = new Map<string, { m: Map<string, string>; exp: number }>();
  const live = (exp: number) => !exp || exp > Date.now();
  return {
    kind: "memory",
    async get<T>(key: string) {
      const hit = mem.get(key);
      return hit && live(hit.exp) ? dec<T>(hit.v) : null;
    },
    async set(key, value, ttlSeconds = 0) {
      mem.set(key, { v: enc(value), exp: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0 });
    },
    async claim(key, ttlSeconds) {
      const hit = mem.get(key);
      if (hit && live(hit.exp)) return false;
      mem.set(key, { v: "1", exp: Date.now() + ttlSeconds * 1000 });
      return true;
    },
    async del(key) {
      mem.delete(key);
      hashes.delete(key);
    },
    async incr(key, ttlSeconds) {
      const hit = mem.get(key);
      const n = (hit && live(hit.exp) ? Number(hit.v) : 0) + 1;
      // keep the original expiry: the window doesn't slide on every hit
      mem.set(key, { v: String(n), exp: hit && live(hit.exp) && hit.exp ? hit.exp : Date.now() + ttlSeconds * 1000 });
      return n;
    },
    async decr(key) {
      const hit = mem.get(key);
      if (!hit || !live(hit.exp)) return 0;
      const n = Math.max(0, Number(hit.v) - 1);
      mem.set(key, { v: String(n), exp: hit.exp });
      return n;
    },
    async hset(key, field, value, ttlSeconds = 0) {
      let h = hashes.get(key);
      if (!h || !live(h.exp)) hashes.set(key, (h = { m: new Map(), exp: 0 }));
      h.m.set(field, enc(value));
      if (ttlSeconds) h.exp = Date.now() + ttlSeconds * 1000;
    },
    async hvals<T>(key: string) {
      const h = hashes.get(key);
      return h && live(h.exp) ? [...h.m.values()].map((v) => dec<T>(v)!) : [];
    },
  };
}

export const store: KV =
  url && token ? upstashStore(new Redis({ url, token, automaticDeserialization: false, retry: { retries: 3, backoff: (n) => 100 * 2 ** n } })) : memoryStore();

/** Fixed-window rate limit: at most `max` hits per `windowSeconds` for `bucket`. Fails open if the store is down. */
export async function limited(bucket: string, max: number, windowSeconds = 60) {
  try {
    // chain-scoped: local dev / the fork must never spend production's quotas in a shared KV
    return (await store.incr(`rl:${TARGET_CHAIN_ID}:${bucket}:${Math.floor(Date.now() / 1000 / windowSeconds)}`, windowSeconds)) > max;
  } catch (e) {
    log("warn", "ratelimit.store_unavailable", { kind: store.kind, error: String((e as Error)?.message ?? e).slice(0, 120) });
    return false;
  }
}

/** The caller's IP. Vercel sets x-vercel-forwarded-for itself; never trust the first X-Forwarded-For entry. */
export function clientIp(req: Request) {
  const trusted = process.env.TRUSTED_IP_HEADER?.toLowerCase() || "x-vercel-forwarded-for";
  const v = req.headers.get(trusted) ?? req.headers.get("x-forwarded-for")?.split(",").at(-1);
  return v?.split(",")[0]?.trim() || "unknown";
}
