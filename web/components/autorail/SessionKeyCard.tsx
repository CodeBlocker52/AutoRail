"use client";
import { KeyRound, ShieldOff } from "lucide-react";
import type { JobWallet, Session } from "@/lib/autorail/types";
import { formatAmount, formatDuration } from "@/lib/autorail/format";
import { useClient } from "@/hooks/useClient";
import { sessionStatus } from "@/hooks/useSessions";
import { useTx } from "@/hooks/useTx";
import { AddressChip } from "@/components/ui/AddressChip";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SpendCapBar } from "@/components/ui/SpendCapBar";
import { TxStatus } from "@/components/ui/TxStatus";
import { cn } from "@/lib/cn";

export function SessionKeyCard({ session, wallet, now }: { session: Session; wallet: JobWallet; now: number }) {
  const client = useClient();
  const tx = useTx("Revoke session");
  const status = now ? sessionStatus(session, now) : "active";
  const remaining = session.totalCap - session.spent;
  const left = session.expiresAt - now;
  const label = (a: string) => wallet.payees.find((p) => p.address.toLowerCase() === a.toLowerCase())?.label ?? a.slice(0, 8) + "…";
  return (
    <article className={cn("rounded-[12px] border p-4", status === "active" ? "border-brand-line bg-surface" : "border-line bg-bg/60")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={cn("grid h-9 w-9 place-items-center rounded-[10px]", status === "active" ? "bg-brand text-white" : "bg-bg-alt text-muted")}>
            {status === "active" ? <KeyRound className="h-4 w-4" aria-hidden /> : <ShieldOff className="h-4 w-4" aria-hidden />}
          </span>
          <div>
            <p className="text-[14.5px] font-semibold text-ink">{session.label}</p>
            <AddressChip address={session.key} className="mt-0.5" />
          </div>
        </div>
        <Badge tone={status === "active" ? "brand" : status === "revoked" ? "danger" : "warning"} dot>
          {status}
        </Badge>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <SpendCapBar label="Total budget used" spent={session.spent} cap={session.totalCap} />
        <dl className="grid grid-cols-2 gap-2 text-[13px]">
          <div>
            <dt className="text-muted">Per payment</dt>
            <dd className="font-mono text-ink">≤ {formatAmount(session.perTxCap)}</dd>
          </div>
          <div>
            <dt className="text-muted">Remaining</dt>
            <dd className="font-mono text-ink">{formatAmount(remaining)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted">{status === "revoked" ? "Revoked" : status === "expired" ? "Expired" : "Expires in"}</dt>
            <dd className="font-mono text-ink" aria-live="off">{status === "active" ? formatDuration(left) : "—"}</dd>
          </div>
        </dl>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Approved payees">
        {session.payees.map((p) => (
          <span key={p} className="rounded-full border border-line bg-bg px-2 py-0.5 text-[12px] text-text">
            {label(p)}
          </span>
        ))}
      </div>
      {status === "active" && (
        <div className="mt-4 flex flex-col gap-3">
          <Button variant="danger" size="sm" className="self-start" loading={tx.isBusy} onClick={() => tx.run((o) => client.revokeSession(session.jobWallet, session.key, o))}>
            Revoke session
          </Button>
        </div>
      )}
      <TxStatus stage={tx.stage} hash={tx.hash} error={tx.error} onDismiss={tx.reset} className="mt-3" labels={{ confirmed: "Revoked" }} />
    </article>
  );
}
