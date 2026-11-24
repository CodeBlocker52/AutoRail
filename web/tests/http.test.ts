import { describe, expect, it } from "vitest";
import { fail } from "@/lib/server/http";
import { CapError } from "@/lib/server/caps";

describe("route errors for caps and the kill switch", () => {
  it("paused → 503 with the friendly message; caps → 429", async () => {
    const paused = fail(new CapError("Paused", "The live demo is paused right now."), "test");
    expect(paused.status).toBe(503);
    expect(await paused.json()).toEqual({ code: "Paused", message: "The live demo is paused right now." });
    expect(fail(new CapError("DailyCapReached", "x"), "test").status).toBe(429);
    expect(fail(new CapError("VendorCapReached", "x"), "test").status).toBe(429);
  });
});
