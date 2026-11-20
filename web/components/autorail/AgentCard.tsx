import { Bot } from "lucide-react";
import type { Agent, AgentRole } from "@/lib/autorail/types";
import { relativeTime } from "@/lib/autorail/format";
import { AddressChip } from "@/components/ui/AddressChip";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

export const ROLE_LABEL: Record<AgentRole, string> = {
  seller: "Seller",
  buyer: "Buyer",
  underwriter: "Underwriter",
  payout: "Payout",
  merchant: "GPU merchant",
};

const STATUS: Record<Agent["status"], { cls: string; label: string }> = {
  online: { cls: "bg-brand", label: "Online" },
  idle: { cls: "bg-muted/50", label: "Idle" },
  blocked: { cls: "bg-danger", label: "Blocked" },
};

const SHELL = "flex h-full min-h-[264px] flex-col rounded-card p-5";

/**
 * Fixed structure for every agent: icon + status → name (2 lines max) →
 * role chip + ERC-8004 id → address → last action pinned to the bottom.
 */
export function AgentCard({ agent, role, now }: { agent?: Agent; role: AgentRole; now?: number }) {
  if (!agent)
    return (
      <div className={cn(SHELL, "border border-dashed border-line")}>
        <div className="flex items-center justify-between">
          <span className="grid h-10 w-10 place-items-center rounded-[10px] border border-dashed border-line text-muted">
            <Bot className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-[12px] text-muted">Not registered</span>
        </div>
        <h3 className="mt-4 line-clamp-2 min-h-[42px] text-[15.5px] font-semibold leading-[21px] text-muted">{ROLE_LABEL[role]} agent</h3>
        <div className="mt-2 flex items-center gap-1.5 whitespace-nowrap">
          <Badge tone="outline">{ROLE_LABEL[role]}</Badge>
          <span className="font-mono text-[11.5px] text-muted">ERC-8004 —</span>
        </div>
        <div className="mt-auto border-t border-line pt-3">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-muted">Last action</p>
          <p className="mt-0.5 text-[13px] text-muted">Registers in demo step 2</p>
        </div>
      </div>
    );
  const st = STATUS[agent.status];
  const blocked = agent.status === "blocked";
  return (
    <article className={cn(SHELL, "border bg-surface shadow-card", blocked ? "border-danger/40" : "border-line")}>
      <div className="flex items-center justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-brand-soft text-brand">
          <Bot className="h-5 w-5" aria-hidden />
        </span>
        <span className={cn("flex items-center gap-1.5 text-[12px]", blocked ? "text-danger" : "text-muted")}>
          <span className={cn("h-2 w-2 rounded-full", st.cls, agent.status === "online" && "animate-pulse")} aria-hidden />
          {st.label}
        </span>
      </div>
      <h3 className="mt-4 line-clamp-2 min-h-[42px] text-[15.5px] font-semibold leading-[21px] text-ink" title={agent.name}>
        {agent.name}
      </h3>
      <div className="mt-2 flex items-center gap-1.5 whitespace-nowrap">
        <Badge tone="brand">{ROLE_LABEL[agent.role]}</Badge>
        <span className="font-mono text-[11.5px] text-muted">ERC-8004 #{agent.agentId}</span>
      </div>
      <AddressChip address={agent.address} className="mt-3 self-start" />
      <div className="mt-auto border-t border-line pt-3">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-muted">Last action</p>
        <p className={cn("mt-0.5 line-clamp-2 text-[13px] leading-snug", blocked ? "text-danger" : "text-text")} title={agent.lastAction}>
          {agent.lastAction ?? "—"}
        </p>
        {agent.lastActionAt && now ? <p className="font-mono text-[11px] text-muted">{relativeTime(agent.lastActionAt, now)}</p> : null}
      </div>
    </article>
  );
}
