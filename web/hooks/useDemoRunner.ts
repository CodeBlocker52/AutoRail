"use client";
import { useCallback, useState } from "react";
import { decodeError, type DecodedError, type DemoPreset, type DemoStep, type TxStage } from "@/lib/autorail";
import { useToasts } from "@/components/ui/Toast";
import { useAutorailQuery, useClient } from "./useClient";

export function useDemoRunner() {
  const client = useClient();
  const toasts = useToasts();
  const steps = useAutorailQuery(["demo"], (c) => c.getDemoSteps());
  const [active, setActive] = useState<{ id: number; stage: TxStage } | null>(null);
  const [error, setError] = useState<DecodedError | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  /** The step that finished most recently (drives presenter flashes and micro-motion). */
  const [lastFinished, setLastFinished] = useState<DemoStep | null>(null);

  const runStep = useCallback(
    async (id: number) => {
      setError(null);
      setActive({ id, stage: "signing" });
      const title = steps.data?.find((s) => s.id === id)?.title ?? "";
      const tid = toasts?.push({ title: `Step ${id} · ${title}`, stage: "signing" });
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
        setLastFinished(res);
        setActive(null);
        return res;
      } catch (e) {
        const err = decodeError(e);
        setError(err);
        if (tid) toasts?.update(tid, { stage: "failed", error: err });
        setActive(null);
        return undefined;
      }
    },
    [client, steps.data, toasts],
  );

  const runAll = useCallback(async () => {
    setRunningAll(true);
    try {
      const list = await client.getDemoSteps();
      for (const s of list) {
        if (s.status === "done") continue;
        const r = await runStep(s.id);
        if (!r || r.status !== "done") break;
      }
    } finally {
      setRunningAll(false);
    }
  }, [client, runStep]);

  const reset = useCallback(
    async (preset: DemoPreset) => {
      setError(null);
      setLastFinished(null);
      await client.resetDemo(preset);
    },
    [client],
  );

  const list = steps.data ?? [];
  const next = list.find((s) => s.status !== "done");
  return { steps: list, isLoading: steps.isLoading, active, error, runStep, runAll, runningAll, reset, next, lastFinished, supported: client.mode === "mock" };
}

export type DemoRunnerState = ReturnType<typeof useDemoRunner>;
