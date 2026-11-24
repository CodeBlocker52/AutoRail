"use client";
import Link from "next/link";
import { ArrowRight, Ban, HandCoins, KeyRound, Landmark, Play, Undo2 } from "lucide-react";
import { useActivity, useAllSessions, useDemoRunner, useNow, useReceivables, useVault } from "@/hooks";
import { sessionStatus } from "@/hooks/useSessions";
import { Amount } from "@/components/ui/Amount";
import { CountUp } from "@/components/ui/CountUp";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader, StatCard } from "@/components/ui/Card";
import { Skeleton, SkeletonRows } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { EventLog } from "@/components/autorail/EventLog";
import { InvoicesTable } from "@/components/autorail/InvoicesTable";

export function OverviewView() {
  const vault = useVault();
  const sessions = useAllSessions();
  const activity = useActivity({ limit: 8 });
  const receivables = useReceivables();
  const demo = useDemoRunner();
  const now = useNow(5000);
  const v = vault.data;
  const active = sessions.data?.filter((s) => sessionStatus(s, now || Math.floor(Date.now() / 1000)) === "active").length;
  const done = demo.steps.filter((s) => s.status === "done").length;
  const val = (x: React.ReactNode) => (v ? x : <Skeleton className="h-7 w-24" />);

  return (
    <div className="space-y-6">
      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Vault assets" icon={<Landmark className="h-4 w-4" />} value={val(<CountUp value={v?.totalAssets ?? 0n} />)} sub="tUSD8 · ERC-4626" />
        <StatCard label="Outstanding" icon={<HandCoins className="h-4 w-4" />} value={val(<CountUp value={v?.outstanding ?? 0n} />)} sub={v ? `${v.activeAdvances} active advance${v.activeAdvances === 1 ? "" : "s"}` : " "} />
        <StatCard label="Repaid" icon={<Undo2 className="h-4 w-4" />} value={val(<CountUp value={v ? v.repaidPrincipal + v.feesEarned : 0n} />)} sub={v ? <>incl. <Amount value={v.feesEarned} symbol={false} /> fees</> : " "} />
        <StatCard label="Defaults" icon={<Ban className="h-4 w-4" />} value={val(<CountUp value={v?.defaults ?? 0n} />)} sub="principal lost" />
        <StatCard label="Active sessions" className="col-span-2 lg:col-span-1" icon={<KeyRound className="h-4 w-4" />} value={active === undefined ? <Skeleton className="h-7 w-10" /> : <CountUp value={BigInt(active)} decimals={0} maxFrac={0} />} sub="scoped agent keys" />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Recent activity" eyebrow="Onchain events" action={<Link href="/app/audit" className="text-[13.5px] font-medium text-brand hover:underline">View audit</Link>} />
          {activity.isLoading ? <SkeletonRows rows={6} /> : <EventLog events={activity.data ?? []} compact />}
        </Card>
        <div className="space-y-6">
          <section className="relative overflow-hidden rounded-card bg-brand p-6 text-white" aria-labelledby="run-demo">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/60">Demo</p>
            <h2 id="run-demo" className="mt-2 font-serif text-[24px] font-bold leading-tight text-white">Run the 12-step scenario</h2>
            <p className="mt-2 text-[14.5px] text-white/75">Deposit, invoice, advance, scoped payouts, three blocked attempts and a lenders-first repayment.</p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full bg-white transition-[width]" style={{ width: `${(done / 12) * 100}%` }} />
            </div>
            <p className="mt-2 font-mono text-[12px] text-white/70">{done}/12 steps done</p>
            <ButtonLink href="/app/agents" variant="inverted" size="sm" className="mt-5" icon={<Play className="h-3.5 w-3.5" />}>
              Open agents console
            </ButtonLink>
          </section>
          <Card>
            <CardHeader title="Where to go" eyebrow="Roles" />
            <ul className="divide-y divide-line">
              {[
                { href: "/app/onboard", t: "Get started", d: "Your own wallet as a vendor or lab (ERC-8004 agent + role)" },
                { href: "/app/lend", t: "Lend", d: "Deposit tUSD8 with one permit" },
                { href: "/app/vendor", t: "Vendor", d: "Register, invoice, take an advance" },
                { href: "/app/lab", t: "Lab", d: "Confirm and pay invoices, gasless" },
                { href: "/app/audit", t: "Audit", d: "Every event with explorer links" },
              ].map((x) => (
                <li key={x.href}>
                  <Link href={x.href} className="group flex items-center justify-between gap-3 py-3">
                    <span>
                      <span className="block text-[14.5px] font-medium text-ink group-hover:text-brand">{x.t}</span>
                      <span className="text-[13px] text-muted">{x.d}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted group-hover:text-brand" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="Invoices" eyebrow="Receivable registry" />
        {receivables.isLoading ? <SkeletonRows /> : receivables.data?.length ? <InvoicesTable items={receivables.data} /> : <EmptyState title="No invoices yet">Create one from the Vendor screen or run demo step 3.</EmptyState>}
      </Card>
    </div>
  );
}
