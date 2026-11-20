"use client";
import { useCallback, useRef, useState } from "react";
import { decodeError, type DecodedError, type Hash, type TxStage, type WriteOptions } from "@/lib/autorail";
import { useToasts } from "@/components/ui/Toast";

export interface TxState {
  stage: TxStage;
  hash?: Hash;
  error?: DecodedError;
}

/**
 * Drives TxStatus for a write: idle → signing → pending → confirmed | failed,
 * and mirrors every stage into a bottom-right toast.
 * Usage: const tx = useTx("Deposit"); tx.run((opts) => client.depositWithPermit(amount, opts))
 */
export function useTx(label = "Transaction") {
  const [state, setState] = useState<TxState>({ stage: "idle" });
  const busy = useRef(false);
  const toasts = useToasts();

  const run = useCallback(
    async <T extends { hash: Hash }>(fn: (opts: WriteOptions) => Promise<T>): Promise<T | undefined> => {
      if (busy.current) return;
      busy.current = true;
      setState({ stage: "signing" });
      const tid = toasts?.push({ title: label, stage: "signing" });
      let lastHash: Hash | undefined;
      try {
        const out = await fn({
          onStage: (stage, hash) => {
            lastHash = hash ?? lastHash;
            setState((s) => ({ stage, hash: hash ?? s.hash }));
            if (tid) toasts?.update(tid, { stage, hash: lastHash });
          },
        });
        setState({ stage: "confirmed", hash: out.hash });
        if (tid) toasts?.update(tid, { stage: "confirmed", hash: out.hash });
        return out;
      } catch (e) {
        const err = decodeError(e);
        setState((s) => ({ stage: "failed", hash: err.txHash ?? s.hash, error: err }));
        if (tid) toasts?.update(tid, { stage: "failed", hash: err.txHash ?? lastHash, error: err });
        return undefined;
      } finally {
        busy.current = false;
      }
    },
    [label, toasts],
  );

  const reset = useCallback(() => setState({ stage: "idle" }), []);
  const isBusy = state.stage === "signing" || state.stage === "pending";
  return { ...state, run, reset, isBusy };
}
