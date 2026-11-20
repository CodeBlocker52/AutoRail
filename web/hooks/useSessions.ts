"use client";
import type { Address, Session, SessionStatus } from "@/lib/autorail";
import { useAutorailQuery } from "./useClient";

export function useSessions(jobWallet: Address | undefined) {
  return useAutorailQuery(["sessions", jobWallet], (c) => c.getSessions(jobWallet!), !!jobWallet);
}

export function sessionStatus(s: Session, now = Math.floor(Date.now() / 1000)): SessionStatus {
  if (s.revoked) return "revoked";
  if (s.expiresAt <= now) return "expired";
  return "active";
}

/** Every session across all JobWallets (for overview counts). */
export function useAllSessions() {
  return useAutorailQuery(["sessions-all"], async (c) => {
    const rs = await c.getReceivables();
    const ws = (await Promise.all(rs.map((r) => c.getJobWallet(r.id)))).filter((w) => w !== null);
    return (await Promise.all(ws.map((w) => c.getSessions(w.address)))).flat();
  });
}
