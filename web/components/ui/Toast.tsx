"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { DecodedError } from "@/lib/autorail/errors";
import type { Hash, TxStage } from "@/lib/autorail/types";
import { TxStatus } from "./TxStatus";

export interface TxToast {
  id: number;
  title: string;
  stage: TxStage;
  hash?: Hash;
  error?: DecodedError;
  /** Expected revert (demo safety steps): shown as a revert, not a failure. */
  revertNote?: string;
}

interface ToastApi {
  push: (t: Omit<TxToast, "id">) => number;
  update: (id: number, patch: Partial<TxToast>) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastApi | null>(null);
/** Returns null outside a ToastProvider, so components still work in isolation. */
export const useToasts = () => useContext(Ctx);

const DONE_MS = 5_000;
const FAIL_MS = 9_000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<TxToast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const schedule = useCallback(
    (id: number, stage: TxStage) => {
      if (stage !== "confirmed" && stage !== "failed") return;
      const old = timers.current.get(id);
      if (old) clearTimeout(old);
      timers.current.set(id, setTimeout(() => dismiss(id), stage === "confirmed" ? DONE_MS : FAIL_MS));
    },
    [dismiss],
  );

  const push = useCallback(
    (t: Omit<TxToast, "id">) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-3), { ...t, id }]);
      schedule(id, t.stage);
      return id;
    },
    [schedule],
  );

  const update = useCallback(
    (id: number, patch: Partial<TxToast>) => {
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      if (patch.stage) schedule(id, patch.stage);
    },
    [schedule],
  );

  const api = useMemo(() => ({ push, update, dismiss }), [push, update, dismiss]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div role="region" aria-live="polite" aria-label="Transactions" className="pointer-events-none fixed bottom-20 right-3 z-[110] flex w-[min(380px,calc(100vw-24px))] flex-col gap-2 lg:bottom-6 lg:right-6">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto animate-[toast-in_.25s_ease-out] rounded-card border border-line bg-surface p-3 shadow-lift">
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="text-[13.5px] font-semibold text-ink">{t.title}</p>
              <button onClick={() => dismiss(t.id)} className="-mr-1 -mt-1 grid h-7 w-7 place-items-center rounded text-muted hover:bg-ink/5 hover:text-ink" aria-label="Dismiss notification">
                <X className="h-4 w-4" />
              </button>
            </div>
            {t.revertNote ? (
              <TxStatus stage="failed" error={{ code: "Unknown", message: t.revertNote, txHash: t.hash }} />
            ) : (
              <TxStatus stage={t.stage} hash={t.hash} error={t.error} className="!bg-surface !px-0 !py-0 !border-0" />
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
