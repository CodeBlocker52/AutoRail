"use client";
import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { decodeError, type DecodedError, type DemoMode, type DemoPreset, type DemoStep, type LivePreflight, type TxStage } from "@/lib/autorail";
import { useToasts } from "@/components/ui/Toast";
import { AUTORAIL_KEY, useAutorailQuery, useClient } from "./useClient";

/**
 * Demo runner state for all three modes:
 * - mock: the in-memory scripted demo
 * - recorded: replays demo-run-44005.json step by step (1…12 with 7a–7c, 10a/10b), each with its explorer link; sends nothing
 * - live: a fresh cycle on chain through /api/demo/live (tiny `live` profile, preflight first)
 */
export function useDemoRunner() {
  const client = useClient();
  const qc = useQueryClient();
  const toasts = useToasts();
  // The client can change after mount (Live / Demo data toggle), so derive the mock case from it.
  const [onchainMode, setModeState] = useState<DemoMode>("recorded");
  const mode: DemoMode = client.mode === "mock" ? "mock" : onchainMode;
  const raw = useAutorailQuery(["demo", mode], (c) => c.getDemoSteps());
  const [active, setActive] = useState<{ id: string; stage: TxStage } | null>(null);
  const [error, setError] = useState<DecodedError | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [preflight, setPreflight] = useState<LivePreflight | null>(null);
  /** Recorded mode: how many steps have been replayed so far. */
  const [replayed, setReplayed] = useState(0);
  /** The step that finished most recently (drives presenter flashes and micro-motion). */
  const [lastFinished, setLastFinished] = useState<DemoStep | null>(null);

  const steps = useMemo<DemoStep[]>(() => {
    const list = raw.data ?? [];
    if (mode !== "recorded") return list;
    return list.map((s, i) => (i < replayed ? s : { ...s, status: "pending", result: undefined, txHashes: [] }));
  }, [raw.data, mode, replayed]);

  const runStep = useCallback(
    async (id: string) => {
      setError(null);
      const title = steps.find((s) => s.id === id)?.title ?? "";
      if (mode === "recorded") {
        const idx = (raw.data ?? []).findIndex((s) => s.id === id);
        const rec = raw.data?.[idx];
        if (!rec) return undefined;
        setReplayed((n) => Math.max(n, idx + 1));
        const hash = rec.txHashes[rec.txHashes.length - 1];
        toasts?.push({
          title: `Step ${id} · ${title} (recorded)`,
          stage: rec.expectsRevert ? "failed" : "confirmed",
          hash,
          ...(rec.expectsRevert ? { revertNote: rec.result } : {}),
        });
        setLastFinished(rec);
        return rec;
      }
      setActive({ id, stage: mode === "live" ? "pending" : "signing" });
      const tid = toasts?.push({ title: `Step ${id} · ${title}`, stage: mode === "live" ? "pending" : "signing" });
      try {
        const res = await client.runDemoStep(id, {
          onStage: (stage, hash) => {
            setActive({ id, stage });
            if (tid) toasts?.update(tid, { stage, hash });
          },
        });
        const hash = res.txHashes[res.txHashes.length - 1];
        if (tid) {
          if (res.status === "done" && res.expectsRevert) toasts?.update(tid, { stage: "failed", hash, revertNote: res.result });
          else if (res.status === "done") toasts?.update(tid, { stage: "confirmed", hash });
          else toasts?.update(tid, { stage: "failed", hash, error: { code: "Unknown", message: res.error ?? "Step failed" } });
        }
        if (res.status === "failed") setError({ code: "Unknown", message: res.error ?? "Step failed", txHash: hash });
        setLastFinished(res);
        setActive(null);
        void qc.invalidateQueries({ queryKey: [AUTORAIL_KEY] });
        return res;
      } catch (e) {
        const err = decodeError(e);
        setError(err);
        if (tid) toasts?.update(tid, { stage: "failed", error: err });
        setActive(null);
        return undefined;
      }
    },
    [client, steps, toasts, mode, raw.data, qc],
  );

  const next = steps.find((s) => s.status !== "done");

  const runAll = useCallback(async () => {
    setRunningAll(true);
    try {
      const ids = steps.filter((s) => s.status !== "done").map((s) => s.id);
      for (const id of ids) {
        const r = await runStep(id);
        if (!r || r.status !== "done") break;
        if (mode === "recorded") await new Promise((res) => setTimeout(res, 600));
      }
    } finally {
      setRunningAll(false);
    }
  }, [steps, runStep, mode]);

  const reset = useCallback(
    async (preset: DemoPreset) => {
      setError(null);
      setLastFinished(null);
      if (mode === "recorded") {
        setReplayed(preset === "fresh" ? 0 : (raw.data?.length ?? 0));
        return;
      }
      try {
        await client.resetDemo(preset);
      } catch (e) {
        setError(decodeError(e));
      }
    },
    [client, mode, raw.data],
  );

  /** Switch between the recorded replay and a live run (onchain only). Live runs a preflight first. */
  const setMode = useCallback(
    async (m: DemoMode) => {
      setError(null);
      setLastFinished(null);
      if (m === "live") {
        try {
          const pf = await client.demoPreflight?.();
          setPreflight(pf ?? null);
          if (pf && !pf.ok) {
            setError({ code: "Unknown", message: pf.problems.join(" ") });
            return;
          }
          await client.setDemoMode("live");
          await client.resetDemo("fresh");
        } catch (e) {
          setError(decodeError(e));
          return;
        }
      } else {
        await client.setDemoMode(m);
        setReplayed(0);
      }
      setModeState(m);
    },
    [client],
  );

  return {
    steps,
    isLoading: raw.isLoading,
    active,
    error,
    runStep,
    runAll,
    runningAll,
    reset,
    next,
    lastFinished,
    mode,
    setMode,
    preflight,
    supported: true,
  };
}

export type DemoRunnerState = ReturnType<typeof useDemoRunner>;
