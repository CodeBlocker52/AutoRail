import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Redis } from "@upstash/redis";
import { memoryStore, upstashStore, type KV } from "@/lib/server/store";

/**
 * A tiny fake of the Upstash REST API (POST / with ["CMD", ...args]; POST /multi-exec and /pipeline with
 * [[...], ...]) backed by a Map, so the real @upstash/redis client is exercised over HTTP without credentials.
 */
function fakeUpstash() {
  const kv = new Map<string, { v: string | Map<string, string>; exp: number }>();
  const alive = (k: string) => {
    const e = kv.get(k);
    if (e && e.exp && e.exp < Date.now()) kv.delete(k);
    return kv.get(k);
  };
  const run = (cmd: string[]): unknown => {
    const [op, key, ...a] = [cmd[0].toUpperCase(), ...cmd.slice(1).map(String)];
    switch (op) {
      case "GET":
        return (alive(key)?.v as string) ?? null;
      case "SET": {
        const nx = a.map((x) => x.toUpperCase()).includes("NX");
        if (nx && alive(key)) return null;
        const exI = a.findIndex((x) => x.toUpperCase() === "EX");
        kv.set(key, { v: a[0], exp: exI >= 0 ? Date.now() + Number(a[exI + 1]) * 1000 : 0 });
        return "OK";
      }
      case "DEL":
        return kv.delete(key) ? 1 : 0;
      case "INCR": {
        const e = alive(key);
        const n = Number((e?.v as string) ?? 0) + 1;
        kv.set(key, { v: String(n), exp: e?.exp ?? 0 });
        return n;
      }
      case "EXPIRE": {
        const e = alive(key);
        if (!e) return 0;
        e.exp = Date.now() + Number(a[0]) * 1000;
        return 1;
      }
      case "HSET": {
        let e = alive(key);
        if (!e) kv.set(key, (e = { v: new Map(), exp: 0 }));
        for (let i = 0; i < a.length; i += 2) (e.v as Map<string, string>).set(a[i], a[i + 1]);
        return a.length / 2;
      }
      case "HVALS":
        return [...((alive(key)?.v as Map<string, string>) ?? new Map()).values()];
      default:
        throw new Error(`fake upstash: ${op} not implemented`);
    }
  };
  const calls: string[] = [];
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const b64 = String(req.headers["upstash-encoding"] ?? "").toLowerCase() === "base64";
      const enc = (v: unknown): unknown =>
        b64 && typeof v === "string" && v !== "OK" ? Buffer.from(v).toString("base64") : Array.isArray(v) ? v.map(enc) : v;
      const parsed = JSON.parse(body);
      calls.push(`${req.url} ${JSON.stringify(parsed).slice(0, 60)}`);
      const out = req.url === "/" ? { result: enc(run(parsed)) } : (parsed as string[][]).map((c) => ({ result: enc(run(c)) }));
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(out));
    });
  });
  return { server, kv, calls };
}

const fake = fakeUpstash();
let upstash: KV;
beforeAll(async () => {
  await new Promise<void>((r) => fake.server.listen(0, "127.0.0.1", r));
  const port = (fake.server.address() as AddressInfo).port;
  upstash = upstashStore(new Redis({ url: `http://127.0.0.1:${port}`, token: "test", automaticDeserialization: false, enableTelemetry: false }));
});
afterAll(() => new Promise<void>((r) => fake.server.close(() => r())));

describe.each([
  ["memory", () => memoryStore()],
  ["upstash (REST)", () => upstash],
])("store: %s", (_name, make) => {
  it("get/set JSON with bigints, ttl, del", async () => {
    const s = make();
    await s.set("a", { n: 5n, s: "x" }, 60);
    expect(await s.get("a")).toEqual({ n: "5", s: "x" });
    await s.del("a");
    expect(await s.get("a")).toBeNull();
  });
  it("claim is SET NX (idempotency): only the first caller wins", async () => {
    const s = make();
    const key = `claim:${Math.random()}`;
    expect(await s.claim(key, 60)).toBe(true);
    expect(await s.claim(key, 60)).toBe(false);
    await s.del(key);
    expect(await s.claim(key, 60)).toBe(true);
  });
  it("incr counts within a window (rate limits)", async () => {
    const s = make();
    const key = `rl:${Math.random()}`;
    expect([await s.incr(key, 60), await s.incr(key, 60), await s.incr(key, 60)]).toEqual([1, 2, 3]);
  });
  it("blocked-attempt records: one hash field per tx, no lost writes under concurrency", async () => {
    const s = make();
    const key = `blocked:${Math.random()}`;
    await Promise.all(["0x1", "0x2", "0x3", "0x2"].map((h, i) => s.hset(key, h, { hash: h, block: i }, 3600)));
    const vals = await s.hvals<{ hash: string }>(key);
    expect(vals.map((v) => v.hash).sort()).toEqual(["0x1", "0x2", "0x3"]);
  });
});

describe("memory store expiry", () => {
  it("rate-limit counters keep their expiry (no immortal keys)", async () => {
    const s = memoryStore();
    await s.incr("k", 1);
    await s.incr("k", 1);
    await new Promise((r) => setTimeout(r, 1100));
    expect(await s.incr("k", 1)).toBe(1);
  });
});

describe("upstash wire format", () => {
  it("INCR and EXPIRE go in one MULTI round trip", async () => {
    fake.calls.length = 0;
    await upstash.incr("rt", 60);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toMatch(/^\/multi-exec /);
  });
});
