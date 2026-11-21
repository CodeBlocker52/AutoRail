import "server-only";

/**
 * Tiny key-value store for idempotency, rate limits and recorded blocked attempts.
 * Uses Upstash Redis / Vercel KV over REST when configured (KV_REST_API_URL + KV_REST_API_TOKEN, or
 * UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN); otherwise an in-memory map (fine for one server
 * or local dev; on serverless each instance has its own copy).
 */
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const mem = new Map<string, { v: string; exp: number }>();

async function redis(cmd: (string | number)[]): Promise<unknown> {
  const res = await fetch(url!, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`kv ${res.status}`);
  return ((await res.json()) as { result: unknown }).result;
}

export const store = {
  kind: url && token ? "kv" : "memory",
  async get<T>(key: string): Promise<T | null> {
    if (url && token) {
      const r = (await redis(["GET", key])) as string | null;
      return r ? (JSON.parse(r) as T) : null;
    }
    const hit = mem.get(key);
    if (!hit || (hit.exp && hit.exp < Date.now())) return null;
    return JSON.parse(hit.v) as T;
  },
  async set(key: string, value: unknown, ttlSeconds = 0) {
    const v = JSON.stringify(value, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
    if (url && token) {
      await redis(ttlSeconds ? ["SET", key, v, "EX", ttlSeconds] : ["SET", key, v]);
      return;
    }
    mem.set(key, { v, exp: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0 });
  },
  /** Set only if absent. Returns true if this call claimed the key. */
  async claim(key: string, ttlSeconds: number): Promise<boolean> {
    if (url && token) return (await redis(["SET", key, "1", "NX", "EX", ttlSeconds])) === "OK";
    const hit = mem.get(key);
    if (hit && (!hit.exp || hit.exp > Date.now())) return false;
    mem.set(key, { v: "1", exp: Date.now() + ttlSeconds * 1000 });
    return true;
  },
  async del(key: string) {
    if (url && token) await redis(["DEL", key]);
    else mem.delete(key);
  },
  async incr(key: string, ttlSeconds: number): Promise<number> {
    if (url && token) {
      const n = Number(await redis(["INCR", key]));
      if (n === 1) await redis(["EXPIRE", key, ttlSeconds]);
      return n;
    }
    const cur = await this.get<number>(key);
    const n = (cur ?? 0) + 1;
    await this.set(key, n, cur === null ? ttlSeconds : 0);
    return n;
  },
};

/** Fixed-window rate limit: at most `max` hits per `windowSeconds` for `bucket`. */
export async function limited(bucket: string, max: number, windowSeconds = 60) {
  return (await store.incr(`rl:${bucket}:${Math.floor(Date.now() / 1000 / windowSeconds)}`, windowSeconds)) > max;
}

/** The caller's IP. Vercel sets x-vercel-forwarded-for itself; never trust the first X-Forwarded-For entry. */
export function clientIp(req: Request) {
  const trusted = process.env.TRUSTED_IP_HEADER?.toLowerCase() || "x-vercel-forwarded-for";
  const v = req.headers.get(trusted) ?? req.headers.get("x-forwarded-for")?.split(",").at(-1);
  return v?.split(",")[0]?.trim() || "unknown";
}
