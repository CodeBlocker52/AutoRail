"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ActivityEvent, ActivityType } from "@/lib/autorail/types";
import { dayKey, formatAmount, formatDateTime, formatDayLabel, formatEventTime } from "@/lib/autorail/format";
import { explorerBlock } from "@/lib/chain/aevum";
import { useActivity, useAgents, useReceivables } from "@/hooks";
import { TxHashLink } from "@/components/ui/AddressChip";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { ReputationChart } from "@/components/autorail/Charts";
import { cn } from "@/lib/cn";

const TYPE_GROUPS: { id: string; label: string; types: ActivityType[] }[] = [
  { id: "all", label: "All types", types: [] },
  { id: "invoice", label: "Invoices", types: ["invoice.created", "invoice.confirmed", "invoice.repaid", "invoice.overdue"] },
  { id: "advance", label: "Advances", types: ["advance.funded"] },
  { id: "session", label: "Sessions", types: ["session.granted", "session.revoked"] },
  { id: "payment", label: "Payments", types: ["payment.sent", "payment.blocked"] },
  { id: "vault", label: "Vault", types: ["vault.deposit", "vault.withdraw"] },
  { id: "agent", label: "Agents & reputation", types: ["agent.registered", "reputation.updated"] },
];

function groupByDay(events: ActivityEvent[]): [string, ActivityEvent[]][] {
  const groups = new Map<string, { label: string; list: ActivityEvent[] }>();
  for (const e of events) {
    const k = dayKey(e.timestamp);
    if (!groups.has(k)) groups.set(k, { label: formatDayLabel(e.timestamp), list: [] });
    groups.get(k)!.list.push(e);
  }
  return [...groups.values()].map((g) => [g.label, g.list]);
}

export function AuditView() {
  const id = useId();
  const params = useSearchParams();
  const [invoice, setInvoice] = useState<string>(params.get("invoice") ?? "all");
  const [agent, setAgent] = useState<string>("all");
  const [group, setGroup] = useState("all");
  const { data: receivables } = useReceivables();
  const { data: agents } = useAgents();
  const filter = useMemo(
    () => ({
      receivableId: invoice === "all" ? undefined : invoice,
      agentId: agent === "all" ? undefined : Number(agent),
      types: TYPE_GROUPS.find((g) => g.id === group)?.types,
    }),
    [invoice, agent, group],
  );
  const { data: events, isLoading } = useActivity(filter);
  const seller = agents?.find((a) => a.role === "seller");
  const [repAgent, setRepAgent] = useState<string>("");
  useEffect(() => {
    if (!repAgent && agents?.length) setRepAgent(String((seller ?? agents[0]).agentId));
  }, [agents, seller, repAgent]);
  const chosen = agents?.find((a) => String(a.agentId) === repAgent);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Onchain events" eyebrow={`${events?.length ?? 0} events · explorer-test.qday.info`} />
        <div className="mb-4 grid gap-3 sm:grid-cols-3" role="group" aria-label="Filters">
          <div>
            <label htmlFor={`${id}-inv`} className="label">Invoice</label>
            <select id={`${id}-inv`} className="field" value={invoice} onChange={(e) => setInvoice(e.target.value)}>
              <option value="all">All invoices</option>
              {receivables?.map((r) => (
                <option key={r.id} value={r.id}>{r.invoiceNumber}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-ag`} className="label">Agent</label>
            <select id={`${id}-ag`} className="field" value={agent} onChange={(e) => setAgent(e.target.value)}>
              <option value="all">All agents</option>
              {agents?.map((a) => (
                <option key={a.agentId} value={a.agentId}>#{a.agentId} · {a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-ty`} className="label">Type</label>
            <select id={`${id}-ty`} className="field" value={group} onChange={(e) => setGroup(e.target.value)}>
              {TYPE_GROUPS.map((g) => (
                <option key={g.id} value={g.id}>{g.label}</option>
              ))}
            </select>
          </div>
        </div>
        {isLoading ? (
          <SkeletonRows rows={8} />
        ) : events?.length ? (
          <div className="space-y-6">
            {groupByDay(events).map(([day, list]) => (
              <section key={day} aria-label={day}>
                <h3 className="sticky top-16 z-10 -mx-1 mb-1 bg-surface/95 px-1 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted backdrop-blur">
                  {day} <span className="text-muted/80">· {list.length} event{list.length === 1 ? "" : "s"}</span>
                </h3>
                <ol className="relative">
                  {list.map((e) => {
                    const blocked = e.status === "blocked";
                    return (
                      <li key={e.id} className="relative grid grid-cols-[16px_1fr] gap-x-4 border-l border-line py-3 pl-0 sm:grid-cols-[16px_1fr_auto]">
                        <span aria-hidden className={cn("-ml-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface", blocked ? "bg-danger" : e.status === "info" ? "bg-muted" : "bg-brand")} />
                        <div className={cn("min-w-0 rounded-btn px-3 py-2", blocked && "bg-danger-soft")}>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={blocked ? "danger" : "outline"}>{e.type}</Badge>
                            <p className={cn("text-[14px] font-medium", blocked ? "text-danger" : "text-ink")}>{e.title}</p>
                          </div>
                          {(e.revertReason || e.detail) && <p className={cn("mt-1 text-[13px]", blocked ? "text-danger" : "text-muted")}>{blocked ? `Reverted: ${e.revertReason}` : e.detail}</p>}
                          <p className="mt-1 font-mono text-[11.5px] text-muted sm:hidden">
                            {formatEventTime(e.timestamp)} · block {e.block.toLocaleString("en-US")}
                          </p>
                        </div>
                        <div className="col-start-2 flex flex-wrap items-center gap-x-3 px-3 font-mono text-[11.5px] text-muted sm:col-start-3 sm:flex-col sm:items-end sm:gap-1 sm:px-0 sm:pt-2">
                          <TxHashLink hash={e.txHash} className={blocked ? "!text-danger" : ""} />
                          <a href={explorerBlock(e.block)} target="_blank" rel="noreferrer" className="hidden hover:text-brand sm:inline">
                            block {e.block.toLocaleString("en-US")}
                          </a>
                          <span className="hidden sm:inline">{formatEventTime(e.timestamp)}</span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState title="No events match these filters" />
        )}
      </Card>

      <Card>
        <CardHeader
          title="Reputation history"
          eyebrow="ERC-8004 reputation registry"
          action={
            <label>
              <span className="sr-only">Agent</span>
              <select className="field !h-9 !w-auto !text-[13px]" value={repAgent} onChange={(e) => setRepAgent(e.target.value)}>
                {agents?.map((a) => (
                  <option key={a.agentId} value={a.agentId}>#{a.agentId} · {a.name}</option>
                ))}
              </select>
            </label>
          }
        />
        {chosen ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <ReputationChart entries={chosen.reputation} />
            <ol className="space-y-2">
              {[...chosen.reputation].reverse().map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 rounded-btn border border-line px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[13.5px] text-ink">{r.note}</p>
                    <p className="font-mono text-[11px] text-muted">{formatDateTime(r.timestamp)} · limit {formatAmount(r.advanceLimit)}</p>
                  </div>
                  <span className="font-mono text-[15px] text-ink">{r.score}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <SkeletonRows />
        )}
      </Card>
    </div>
  );
}
