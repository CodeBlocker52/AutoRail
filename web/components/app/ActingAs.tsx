"use client";
import { UserRound } from "lucide-react";
import type { Agent, Role } from "@/lib/autorail/types";
import { shortAddr } from "@/lib/autorail/format";
import { useActor, useRole } from "@/hooks/useRole";
import { useAgents } from "@/hooks/useAgents";

const ROLE_AGENT: Record<Role, Agent["role"] | null> = { lender: null, vendor: "seller", lab: "buyer", agents: "payout" };
const FALLBACK: Record<Role, string> = { lender: "Lender", vendor: "Lumen Data", lab: "Frontier Lab", agents: "Payout agent" };

/** Demo mode only: who the current role acts as (the connected wallet stays in the wallet menu). */
export function ActingAs({ className }: { className?: string }) {
  const { role } = useRole();
  const actor = useActor();
  const { data: agents } = useAgents();
  const kind = ROLE_AGENT[role];
  const agent = kind ? agents?.find((a) => a.role === kind) : undefined;
  const name = (agent?.name ?? FALLBACK[role]).replace(/ \(.*\)$/, "").replace(/ · .*$/, "");
  return (
    <div className={className} title={actor}>
      <span className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-btn border border-brand-line bg-brand-soft/60 px-2.5 font-mono text-[11.5px] text-text">
        <UserRound className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
        <span className="hidden uppercase tracking-[0.12em] text-muted 2xl:inline">Acting as ·</span>
        <span className="truncate font-sans text-[13px] font-medium text-ink">{name}</span>
        {agent && <span className="text-brand">#{agent.agentId}</span>}
        {actor && <span className="hidden text-muted xl:inline">· {shortAddr(actor)}</span>}
      </span>
    </div>
  );
}
