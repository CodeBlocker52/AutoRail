"use client";
import type { AgentRole } from "@/lib/autorail/types";
import { useActivity, useAgents, useNow, useVault } from "@/hooks";
import { CountUp } from "@/components/ui/CountUp";
import { Card, CardHeader } from "@/components/ui/Card";
import { Skeleton, SkeletonRows } from "@/components/ui/Skeleton";
import { AgentCard } from "@/components/autorail/AgentCard";
import { DemoRunner } from "@/components/autorail/DemoRunner";
import { EventLog } from "@/components/autorail/EventLog";

const ORDER: AgentRole[] = ["seller", "buyer", "underwriter", "payout", "merchant"];

export function AgentsView() {
  const { data: agents, isLoading } = useAgents();
  const { data: events, isLoading: evLoading } = useActivity({ limit: 60 });
  const now = useNow(5000);
  const { data: vault } = useVault();
  const { data: all } = useActivity({ types: ["payment.sent", "payment.blocked"] });
  const paid = all?.filter((e) => e.type === "payment.sent").length ?? 0;
  const blocked = all?.filter((e) => e.type === "payment.blocked").length ?? 0;
  const strip: [string, React.ReactNode, string?][] = [
    ["Vault assets", <CountUp key="a" value={vault?.totalAssets ?? 0n} />, "tUSD8"],
    ["Outstanding", <CountUp key="o" value={vault?.outstanding ?? 0n} />, "tUSD8"],
    ["Payments sent", <CountUp key="p" value={BigInt(paid)} decimals={0} maxFrac={0} />],
    ["Blocked onchain", <CountUp key="b" value={BigInt(blocked)} decimals={0} maxFrac={0} className={blocked ? "text-danger" : ""} />],
  ];
  return (
    <div className="space-y-6">
      <dl aria-label="Live numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {strip.map(([k, v, unit]) => (
          <div key={k} className="card flex items-baseline justify-between gap-2 px-4 py-3">
            <dt className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-muted">{k}</dt>
            <dd className="text-[20px] text-ink">
              {v}
              {unit && <span className="ml-1 font-mono text-[11px] text-muted">{unit}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <section aria-label="Agents" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {isLoading
          ? ORDER.map((r) => <Skeleton key={r} className="h-56 w-full" />)
          : ORDER.map((role) => <AgentCard key={role} role={role} agent={agents?.find((a) => a.role === role)} now={now} />)}
      </section>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <DemoRunner />
        <Card className="xl:sticky xl:top-24 xl:self-start">
          <CardHeader
            title="Live event log"
            eyebrow="Agents · onchain"
            action={
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-brand">
                <span className="h-2 w-2 animate-pulse rounded-full bg-brand" aria-hidden /> Live
              </span>
            }
          />
          {evLoading ? <SkeletonRows rows={8} /> : <EventLog events={events ?? []} maxHeight={640} />}
        </Card>
      </div>
    </div>
  );
}
