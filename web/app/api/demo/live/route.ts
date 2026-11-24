import { json, fail } from "@/lib/server/http";
import { getRun, LIVE_STEPS, preflight, runStep, startRun } from "@/lib/server/liveDemo";
import { clientIp, limited, store } from "@/lib/server/store";
import { assertNotPaused, limits, takeDaily, takeHourly } from "@/lib/server/caps";
import { TARGET_CHAIN_ID } from "@/lib/chain/aevum";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * "Run live": a fresh cycle on Aevum with the tiny `live` profile (contracts/config/demo.json).
 *   GET  ?runId=…              → run state (or the step list + preflight when no runId)
 *   POST { action: "preflight" }          → balances / liquidity checks
 *   POST { action: "start" }              → { runId, receivableId } (fails if preflight fails)
 *   POST { action: "step", runId, step }  → executes one step with the server-side role keys (idempotent)
 */
export async function GET(req: Request) {
  try {
    const runId = new URL(req.url).searchParams.get("runId");
    if (runId) {
      const run = await getRun(runId);
      return run ? json(run) : json({ code: "UnknownRun", message: "Unknown or expired run." }, 404);
    }
    return json({ steps: LIVE_STEPS });
  } catch (e) {
    return fail(e, "demo.live");
  }
}

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { action?: string; runId?: string; step?: string };
    const ip = clientIp(req);
    if (b.action === "preflight") return json(await preflight());
    if (b.action === "start") {
      assertNotPaused();
      const l = limits();
      await takeHourly(store, TARGET_CHAIN_ID, "runLive", ip, l.runLivePerIpHour, `Live runs are limited to ${l.runLivePerIpHour} per hour per network. Replay the recorded run meanwhile.`);
      const pf = await preflight();
      if (!pf.ok) return json({ code: "Preflight", message: pf.problems.join(" "), preflight: pf }, 409);
      await takeDaily(store, TARGET_CHAIN_ID, "runLive");
      return json(await startRun());
    }
    if (b.action === "step") {
      assertNotPaused();
      if (typeof b.runId !== "string" || typeof b.step !== "string") return json({ code: "BadRequest", message: "runId and step are required." }, 400);
      if (await limited(`live:step:${ip}`, 40, 60)) return json({ code: "RateLimited", message: "Slow down." }, 429);
      return json(await runStep(b.runId, b.step));
    }
    return json({ code: "BadRequest", message: "Unknown action." }, 400);
  } catch (e) {
    return fail(e, "demo.live");
  }
}
