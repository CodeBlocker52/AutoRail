"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { DEFAULT_MODE, resolveMode, setRuntimeMode, switchMode, type AppMode } from "@/lib/autorail/mode";

export interface Health {
  status: "ok" | "degraded" | "down";
  chainId: number;
  rpc: { latestBlock: number | null; ms: number; error: string | null };
  kv: { backend: string; ok: boolean };
  features: Record<string, boolean>;
  warnings: string[];
  appCommit: string | null;
  deploymentCommit: string;
}

interface ModeState {
  /** Mode in effect. Equals the build default until mounted, so server and first client render match. */
  mode: AppMode;
  ready: boolean;
  setMode: (m: AppMode) => void;
  health: Health | null;
  /** Live mode and the RPC (or our API) isn't answering. */
  rpcDown: boolean;
  recheck: () => void;
}

const Ctx = createContext<ModeState>({ mode: DEFAULT_MODE, ready: false, setMode: switchMode, health: null, rpcDown: false, recheck: () => {} });

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AppMode>(DEFAULT_MODE);
  const [ready, setReady] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [rpcDown, setRpcDown] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const m = resolveMode();
    setRuntimeMode(m);
    setModeState(m);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || mode !== "onchain") return;
    let alive = true;
    const check = async () => {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 10_000);
        const res = await fetch("/api/health", { signal: ctl.signal, cache: "no-store" });
        clearTimeout(t);
        const h = (await res.json()) as Health;
        if (!alive) return;
        setHealth(h);
        setRpcDown(h.status === "down" || h.rpc?.latestBlock === null);
      } catch {
        if (alive) setRpcDown(true);
      }
    };
    void check();
    const id = setInterval(check, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [ready, mode, tick]);

  const setMode = useCallback((m: AppMode) => switchMode(m), []);
  const recheck = useCallback(() => setTick((t) => t + 1), []);
  return <Ctx.Provider value={{ mode, ready, setMode, health, rpcDown, recheck }}>{children}</Ctx.Provider>;
}

export const useMode = () => useContext(Ctx);
