"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { decodeError, type DecodedError, type Hash, type TxStage, type WriteOptions } from "@/lib/autorail";
import { useToasts } from "@/components/ui/Toast";
import { useClient } from "./useClient";

export interface TxState {
  stage: TxStage;
  hash?: Hash;
  error?: DecodedError;
}

const pendingKey = (label: string) => `autorail:pending:${label}`;

/**
 * Drives TxStatus for a write: idle → signing → pending → confirmed | failed, and mirrors every stage into a toast.
 * - Double-click / double-submit safe: a second `run` while one is in flight is ignored (ref guard, not state).
 * - Navigation safe: a pending hash is kept in sessionStorage; on return the hook resumes waiting for it.
 * Usage: const tx = useTx("Deposit"); tx.run((opts) => client.depositWithPermit(amount, opts))
 */
export function useTx(label = "Transaction") {
  const [state, setState] = useState<TxState>({ stage: "idle" });
  const busy = useRef(false);
  const toasts = useToasts();
  const client = useClient();

  // Resume a tx that was still pending when the user navigated away.
  useEffect(() => {
    if (!client.waitForTx || typeof window === "undefined") return;
    const hash = window.sessionStorage.getItem(pendingKey(label)) as Hash | null;
    if (!hash || busy.current) return;
    busy.current = true;
    setState({ stage: "pending", hash });
    client
      .waitForTx(hash)
      .then(() => setState({ stage: "confirmed", hash }))
      .catch((e) => setState({ stage: "failed", hash, error: decodeError(e) }))
      .finally(() => {
        busy.current = false;
        window.sessionStorage.removeItem(pendingKey(label));
      });
  }, [client, label]);

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
            if (stage === "pending" && hash) {
              try {
                window.sessionStorage.setItem(pendingKey(label), hash);
              } catch {
                /* storage unavailable */
              }
            }
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
        try {
          window.sessionStorage.removeItem(pendingKey(label));
        } catch {
          /* storage unavailable */
        }
      }
    },
    [label, toasts],
  );

  const reset = useCallback(() => setState({ stage: "idle" }), []);
  const isBusy = state.stage === "signing" || state.stage === "pending";
  return { ...state, run, reset, isBusy };
}
