import { afterEach, describe, expect, it } from "vitest";
import { memoryStore } from "@/lib/server/store";
import { assertNotPaused, CapError, limits, takeDaily, takeHourly, usage } from "@/lib/server/caps";

const CHAIN = 44005;
afterEach(() => {
  delete process.env.DEMO_PAUSED;
  delete process.env.CAP_AUTOPAY_DAILY;
  delete process.env.CAP_ONBOARD_DAILY;
});

describe("kill switch", () => {
  it("DEMO_PAUSED=true blocks every spending action with a friendly message", () => {
    expect(() => assertNotPaused()).not.toThrow();
    process.env.DEMO_PAUSED = "true";
    expect(() => assertNotPaused()).toThrow(CapError);
    try {
      assertNotPaused();
    } catch (e) {
      expect((e as CapError).code).toBe("Paused");
      expect((e as CapError).message).toMatch(/paused/i);
    }
  });
});

describe("daily caps", () => {
  it("defaults: auto-pay 10/day globally, 2/day per vendor", () => {
    expect(limits().autoPay).toBe(10);
    expect(limits().autoPayPerVendor).toBe(2);
  });

  it("allows up to the limit, then refuses with DailyCapReached; env overrides the limit", async () => {
    process.env.CAP_ONBOARD_DAILY = "3";
    const kv = memoryStore();
    for (let i = 0; i < 3; i++) await takeDaily(kv, CHAIN, "onboard");
    await expect(takeDaily(kv, CHAIN, "onboard")).rejects.toMatchObject({ code: "DailyCapReached" });
    const u = await usage(kv, CHAIN);
    expect(u.caps.onboard).toEqual({ limit: 3, used: 3, remaining: 0 }); // the refused attempt isn't counted
  });

  it("per-vendor sub-cap (2/day) bites before the global cap and doesn't burn global slots", async () => {
    const kv = memoryStore();
    const scope = (id: string) => ({ scope: { id, limit: 2, message: "vendor cap" } });
    await takeDaily(kv, CHAIN, "autoPay", scope("vendor-6"));
    await takeDaily(kv, CHAIN, "autoPay", scope("vendor-6"));
    await expect(takeDaily(kv, CHAIN, "autoPay", scope("vendor-6"))).rejects.toMatchObject({ code: "VendorCapReached", message: "vendor cap" });
    await takeDaily(kv, CHAIN, "autoPay", scope("vendor-9")); // another vendor still fine
    expect((await usage(kv, CHAIN)).caps.autoPay.used).toBe(3);
  });

  it("global auto-pay cap of 10 across vendors", async () => {
    const kv = memoryStore();
    for (let v = 0; v < 5; v++) for (let i = 0; i < 2; i++) await takeDaily(kv, CHAIN, "autoPay", { scope: { id: `v${v}`, limit: 2, message: "x" } });
    await expect(takeDaily(kv, CHAIN, "autoPay", { scope: { id: "v99", limit: 2, message: "x" } })).rejects.toMatchObject({ code: "DailyCapReached" });
    expect((await usage(kv, CHAIN)).caps.autoPay.remaining).toBe(0);
  });

  it("release() gives the slot back when the action fails", async () => {
    process.env.CAP_AUTOPAY_DAILY = "1";
    const kv = memoryStore();
    const slot = await takeDaily(kv, CHAIN, "autoPay", { scope: { id: "v1", limit: 2, message: "x" } });
    await slot.release();
    await expect(takeDaily(kv, CHAIN, "autoPay", { scope: { id: "v1", limit: 2, message: "x" } })).resolves.toBeDefined();
  });

  it("caps are chain-scoped (fork traffic never spends Aevum's)", async () => {
    process.env.CAP_ONBOARD_DAILY = "1";
    const kv = memoryStore();
    await takeDaily(kv, 440050, "onboard");
    await expect(takeDaily(kv, CHAIN, "onboard")).resolves.toBeDefined();
  });
});

describe("hourly caps", () => {
  it("Run live: 1 per IP per hour", async () => {
    const kv = memoryStore();
    await takeHourly(kv, CHAIN, "runLive", "203.0.113.7", 1, "one per hour");
    await expect(takeHourly(kv, CHAIN, "runLive", "203.0.113.7", 1, "one per hour")).rejects.toMatchObject({ code: "HourlyCapReached" });
    await expect(takeHourly(kv, CHAIN, "runLive", "203.0.113.8", 1, "one per hour")).resolves.toBeUndefined();
  });
});
