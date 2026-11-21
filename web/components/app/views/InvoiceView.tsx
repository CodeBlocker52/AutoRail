"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { ArrowLeft, Ban, CircleCheck, Plus } from "lucide-react";
import type { Address, JobWallet, Receivable, Session } from "@/lib/autorail/types";
import { formatAmount, formatDate, formatDateTime, parseTokenInput } from "@/lib/autorail/format";
import { useActivity, useAgents, useClient, useJobWallet, useNow, usePayments, useReceivable, useRepayment, useSessions, useTx } from "@/hooks";
import { sessionStatus } from "@/hooks/useSessions";
import { AddressChip, TxHashLink } from "@/components/ui/AddressChip";
import { Amount } from "@/components/ui/Amount";
import { Badge, StateBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton, SkeletonRows } from "@/components/ui/Skeleton";
import { SpendCapBar } from "@/components/ui/SpendCapBar";
import { StepTimeline, type TimelineStep } from "@/components/ui/StepTimeline";
import { TokenInput } from "@/components/ui/TokenInput";
import { TxStatus } from "@/components/ui/TxStatus";
import { WaterfallBar } from "@/components/ui/WaterfallBar";
import { AdvanceOfferCard } from "@/components/autorail/AdvanceOfferCard";
import { EventLog } from "@/components/autorail/EventLog";
import { GrantSessionModal } from "@/components/autorail/GrantSessionModal";
import { SessionKeyCard } from "@/components/autorail/SessionKeyCard";
import { cn } from "@/lib/cn";

function stepsFor(r: Receivable): TimelineStep[] {
  const order = ["Created", "Confirmed", "Funded", "Repaid"] as const;
  const terminal = r.state === "Overdue" || r.state === "Defaulted";
  const reached = terminal ? 2 : order.indexOf(r.state as (typeof order)[number]);
  const subs: Record<string, string> = {
    Created: formatDate(r.createdAt),
    Confirmed: r.confirmedAt ? `EIP-712 · ${formatDate(r.confirmedAt)}` : "awaiting buyer",
    Funded: r.advance ? `${formatAmount(r.advance.advanceAmount)} advanced` : "after confirmation",
    Repaid: r.repaidAt ? formatDate(r.repaidAt) : `due ${formatDate(r.dueDate)}`,
  };
  const steps: TimelineStep[] = order.map((label, i) => ({
    label,
    sub: subs[label],
    status: i <= reached ? "done" : i === reached + 1 ? "current" : "todo",
  }));
  if (terminal) steps[3] = { label: r.state, sub: `due ${formatDate(r.dueDate)}`, status: r.state === "Defaulted" ? "error" : "warning" };
  return steps;
}

function Parties({ r }: { r: Receivable }) {
  const { data: agents } = useAgents();
  const find = (id: number) => agents?.find((a) => a.agentId === id);
  const underwriter = agents?.find((a) => a.role === "underwriter");
  const rows = [
    { role: "Seller agent", a: find(r.sellerAgentId), fallback: r.seller, name: r.sellerName },
    { role: "Buyer agent", a: find(r.buyerAgentId), fallback: r.buyer, name: r.buyerName },
    { role: "Underwriter", a: underwriter, fallback: underwriter?.address, name: underwriter?.name },
  ];
  return (
    <Card>
      <CardHeader title="Parties" eyebrow="ERC-8004 agents" />
      <ul className="space-y-3">
        {rows.map((p) => (
          <li key={p.role} className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-muted">{p.role}</p>
              <p className="truncate text-[14px] font-medium text-ink">
                {p.name ?? "—"} {p.a && <span className="font-mono text-[12px] font-normal text-muted">#{p.a.agentId}</span>}
              </p>
            </div>
            {p.fallback && <AddressChip address={p.a?.address ?? p.fallback} />}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function JobWalletPanel({ wallet }: { wallet: JobWallet }) {
  return (
    <Card>
      <CardHeader title="JobWallet" eyebrow="Per-invoice wallet" action={wallet.closed ? <Badge tone="outline">Closed</Badge> : <Badge tone="brand" dot>Open</Badge>} />
      <AddressChip address={wallet.address} />
      <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-[10px] border border-line bg-line">
        {[
          ["Balance", wallet.balance],
          ["Funded", wallet.funded],
          [wallet.closed ? "Swept" : "Spent", wallet.closed ? wallet.swept : wallet.spent],
        ].map(([k, v]) => (
          <div key={k as string} className="bg-surface p-3">
            <dt className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-muted">{k as string}</dt>
            <dd className="mt-1 font-mono text-[16px] text-ink">{formatAmount(v as bigint)}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-5 text-[13px] font-medium text-ink">Budget lines</h3>
      <div className="mt-2 space-y-3">
        {wallet.budgetLines.map((l) => (
          <SpendCapBar key={l.payee} variant="budget" label={l.label} spent={l.spent} cap={l.budget} />
        ))}
      </div>
    </Card>
  );
}

function SessionManager({ wallet, sessions }: { wallet: JobWallet; sessions: Session[] | undefined }) {
  const [open, setOpen] = useState(false);
  const { data: agents } = useAgents();
  const now = useNow();
  const payoutKey = agents?.find((a) => a.role === "payout")?.address;
  return (
    <Card>
      <CardHeader
        title="Session keys"
        eyebrow="Scoped agent spending"
        action={
          !wallet.closed && (
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
              Grant session
            </Button>
          )
        }
      />
      {!sessions ? (
        <SkeletonRows rows={2} />
      ) : sessions.length ? (
        <div className="space-y-3">
          {sessions.map((s) => (
            <SessionKeyCard key={s.id} session={s} wallet={wallet} now={now} />
          ))}
        </div>
      ) : (
        <EmptyState title="No sessions yet">Grant your payout agent a key with approved payees, caps and an expiry.</EmptyState>
      )}
      <GrantSessionModal open={open} onClose={() => setOpen(false)} wallet={wallet} defaultKey={payoutKey} />
    </Card>
  );
}

function SendPayment({ wallet, sessions }: { wallet: JobWallet; sessions: Session[] }) {
  const id = useId();
  const client = useClient();
  const tx = useTx("Payment");
  const now = useNow();
  const keys = Array.from(new Set(sessions.map((s) => s.key)));
  const [from, setFrom] = useState<string>(keys[0] ?? "owner");
  const [payeeSel, setPayeeSel] = useState<string>(wallet.payees[0]?.address ?? "");
  const [custom, setCustom] = useState("0xbad0000000000000000000000000000000000bad");
  const [amount, setAmount] = useState("0.10");
  const [memo, setMemo] = useState("Batch 8 · QA pass");
  const payee = payeeSel === "custom" ? custom : payeeSel;
  const amountV = parseTokenInput(amount);
  const valid = /^0x[0-9a-fA-F]{40}$/.test(payee) && !!amountV;
  const sessionLabel = (k: string) => {
    const s = sessions.find((x) => x.key === k && !x.revoked) ?? sessions.find((x) => x.key === k)!;
    return `${s.label} (${now ? sessionStatus(s, now) : "…"})`;
  };
  if (wallet.closed) return null;
  return (
    <Card>
      <CardHeader title="Send a payment" eyebrow="Try the limits" />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          tx.run((o) => client.pay(wallet.address, { sessionKey: from === "owner" ? undefined : (from as Address), payee: payee as Address, amount: amountV!, memo }, o));
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-from`} className="label">Pay as</label>
            <select id={`${id}-from`} className="field" value={from} onChange={(e) => setFrom(e.target.value)}>
              {keys.map((k) => (
                <option key={k} value={k}>
                  {sessionLabel(k)}
                </option>
              ))}
              <option value="owner">Vendor (owner)</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-to`} className="label">Payee</label>
            <select id={`${id}-to`} className="field" value={payeeSel} onChange={(e) => setPayeeSel(e.target.value)}>
              {wallet.payees.map((p) => (
                <option key={p.address} value={p.address}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Other address…</option>
            </select>
          </div>
        </div>
        {payeeSel === "custom" && (
          <div>
            <label htmlFor={`${id}-addr`} className="label">Payee address</label>
            <input id={`${id}-addr`} className="field font-mono !text-[13px]" value={custom} onChange={(e) => setCustom(e.target.value.trim())} spellCheck={false} />
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TokenInput label="Amount" value={amount} onChange={setAmount} balance={wallet.balance} />
          <div>
            <label htmlFor={`${id}-memo`} className="label">Memo</label>
            <input id={`${id}-memo`} className="field" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>
        </div>
        <Button type="submit" disabled={!valid} loading={tx.isBusy}>
          Send payment
        </Button>
        <TxStatus stage={tx.stage} hash={tx.hash} error={tx.error} onDismiss={tx.reset} labels={{ signing: from === "owner" ? "Awaiting signature" : "Session key signing" }} />
      </form>
    </Card>
  );
}

function PaymentsList({ wallet }: { wallet: JobWallet }) {
  const { data, isLoading } = usePayments(wallet.address);
  return (
    <Card>
      <CardHeader title="Payments" eyebrow="Paid and blocked" />
      {isLoading ? (
        <SkeletonRows />
      ) : data?.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-[10px] border border-line">
          {data.map((p) => {
            const blocked = p.status === "blocked";
            return (
              <li key={p.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-3", blocked && "bg-danger-soft")}>
                {blocked ? <Ban className="h-4 w-4 text-danger" aria-label="Blocked" /> : <CircleCheck className="h-4 w-4 text-brand" aria-label="Paid" />}
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[14px] font-medium", blocked ? "text-danger" : "text-ink")}>{p.payeeLabel}</p>
                  <p className={cn("truncate text-[12.5px]", blocked ? "text-danger" : "text-muted")}>{blocked ? p.revertReason : p.memo}</p>
                </div>
                <Amount value={p.amount} className={cn("text-[14px]", blocked ? "text-danger line-through" : "text-ink")} />
                <TxHashLink hash={p.txHash} className={cn("text-[11.5px]", blocked && "!text-danger")} />
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="No payments yet" />
      )}
    </Card>
  );
}

function RepaymentCard({ r, wallet }: { r: Receivable; wallet?: JobWallet | null }) {
  const { data: rep } = useRepayment(r.id);
  if (!r.advance && !rep) return null;
  const principal = rep?.vaultPrincipal ?? r.advance!.advanceAmount;
  const fee = rep?.vaultFee ?? r.advance!.feeAmount;
  const remainder = rep?.vendorRemainder ?? r.amount - principal - fee;
  const swept = rep?.unspentSwept ?? wallet?.balance ?? 0n;
  return (
    <Card>
      <CardHeader title={rep ? "Repayment" : "Projected repayment"} eyebrow="Lenders-first waterfall" action={rep && <TxHashLink hash={rep.txHash} />} />
      <WaterfallBar
        total={r.amount}
        segments={[
          { label: "Vault principal", amount: principal, tone: "brand" },
          { label: "Vault fee", amount: fee, tone: "brand-mid" },
          { label: "Vendor remainder", amount: remainder, tone: "soft" },
        ]}
        note={`${rep ? "+" : "+ about"} ${formatAmount(swept)} unspent ${rep ? "was" : "will be"} swept from the JobWallet to the vendor.`}
        caption={rep ? `Paid ${formatDateTime(rep.timestamp)} · one transaction` : "One EIP-3009 signature. One transaction."}
      />
    </Card>
  );
}

export function InvoiceView({ id }: { id: string }) {
  const { data: r, isLoading } = useReceivable(id);
  const { data: wallet } = useJobWallet(id);
  const { data: sessions } = useSessions(wallet?.address);
  const { data: events } = useActivity({ receivableId: id });

  if (isLoading)
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (!r)
    return (
      <EmptyState title="Invoice not found" action={<Link href="/app/vendor" className="text-brand underline">Back to vendor</Link>}>
        No receivable with id {id}. In mock mode, data resets when the page reloads.
      </EmptyState>
    );

  return (
    <div className="space-y-6">
      <Link href="/app/vendor" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-muted hover:text-brand">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Invoices
      </Link>
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-serif text-[30px] font-bold leading-none text-ink">{r.invoiceNumber}</h2>
              <StateBadge state={r.state} />
            </div>
            <p className="mt-2 text-[14.5px] text-muted">
              {r.sellerName} → {r.buyerName} · due {formatDate(r.dueDate)}
            </p>
            <p className="mt-1 font-mono text-[11.5px] text-muted">
              Receivable #{r.id} · invoice hash {r.invoiceHash.slice(0, 10)}…{r.invoiceHash.slice(-6)} · <TxHashLink hash={r.txHash} />
            </p>
          </div>
          <div className="sm:text-right">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-muted">Invoice amount</p>
            <p className="font-mono text-[30px] leading-tight text-ink">
              {formatAmount(r.amount)} <span className="text-[14px] text-muted">tUSD8</span>
            </p>
          </div>
        </div>
        <div className="mt-6 border-t border-line pt-6">
          <StepTimeline steps={stepsFor(r)} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="space-y-6">
          <Parties r={r} />
          {wallet && <JobWalletPanel wallet={wallet} />}
          {(r.state === "Confirmed" || r.advance) && <AdvanceOfferCard receivable={r} />}
          {r.state === "Created" && (
            <Card>
              <CardHeader title="Waiting for the lab" eyebrow="Next step" />
              <p className="text-[14.5px] text-muted">
                The buyer agent must sign the EIP-712 confirmation before this invoice can be funded. Switch to the <Link href="/app/lab" className="font-medium text-brand underline">Lab</Link> role to confirm it.
              </p>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          {wallet && <SessionManager wallet={wallet} sessions={sessions} />}
          {wallet && sessions && <SendPayment key={sessions.map((s) => s.id).join()} wallet={wallet} sessions={sessions} />}
          {wallet && <PaymentsList wallet={wallet} />}
          <RepaymentCard r={r} wallet={wallet} />
        </div>
      </div>

      <Card>
        <CardHeader title="Audit timeline" eyebrow="Every event for this invoice" action={<Link href={`/app/audit?invoice=${r.id}`} className="text-[13.5px] font-medium text-brand hover:underline">Open in audit</Link>} />
        <EventLog events={events ?? []} />
      </Card>
    </div>
  );
}
