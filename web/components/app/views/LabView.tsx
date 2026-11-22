"use client";
import Link from "next/link";
import { useState } from "react";
import { Fuel } from "lucide-react";
import type { Receivable, Repayment } from "@/lib/autorail/types";
import { formatAmount, formatDate, shortAddr } from "@/lib/autorail/format";
import { useActor, useBalances, useClient, useConfirmationTypedData, usePaymentTypedData, useReceivables, useTx } from "@/hooks";
import { Amount } from "@/components/ui/Amount";
import { StateBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { TxStatus } from "@/components/ui/TxStatus";
import { WaterfallBar } from "@/components/ui/WaterfallBar";
import { FaucetHint } from "@/components/autorail/FaucetHint";
import { OnboardCallout } from "@/components/app/OnboardCallout";
import { TypedDataReview } from "@/components/autorail/TypedDataReview";

function ConfirmModal({ r, onClose }: { r: Receivable; onClose: () => void }) {
  const client = useClient();
  const tx = useTx("Confirm invoice (EIP-712)");
  const { data: typed } = useConfirmationTypedData(r.id);
  const payee = typed?.message.payee as string | undefined;
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Confirm ${r.invoiceNumber}`}
      description="Review what your buyer agent is signing. This fixes the amount, due date and payee."
      footer={
        tx.stage === "confirmed" ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={() => tx.run((o) => client.confirmReceivable(r.id, o))} loading={tx.isBusy}>
              Sign confirmation
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <TypedDataReview
          typedData={typed}
          summary={
            <>
              You confirm you owe <strong className="font-mono">{formatAmount(r.amount)} tUSD8</strong> to <strong>{r.sellerName}</strong> by <strong>{formatDate(r.dueDate)}</strong>, payable to the Autorail router{" "}
              <span className="font-mono text-[13px]">{payee ? shortAddr(payee) : "…"}</span>.
            </>
          }
        />
        <p className="text-[13px] text-muted">The payee is fixed to the router, so payment can&apos;t be redirected later. Signing costs no gas.</p>
        <TxStatus stage={tx.stage} hash={tx.hash} error={tx.error} onDismiss={tx.reset} labels={{ signing: "Sign EIP-712", confirmed: "Confirmed" }} />
      </div>
    </Modal>
  );
}

function PayModal({ r, onClose }: { r: Receivable; onClose: () => void }) {
  const client = useClient();
  const tx = useTx("Pay invoice (EIP-3009)");
  const { data: typed } = usePaymentTypedData(r.id);
  const [rep, setRep] = useState<Repayment | null>(null);
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Pay ${r.invoiceNumber}`}
      description="One gasless EIP-3009 signature. A relayer submits it; the router repays lenders first."
      footer={
        rep ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button
              onClick={async () => {
                const res = await tx.run((o) => client.payInvoice(r.id, o));
                if (res) setRep(res.repayment);
              }}
              loading={tx.isBusy}
            >
              Sign and pay {formatAmount(r.amount)} tUSD8
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {!rep && (
          <TypedDataReview
            standard="EIP-3009"
            typedData={typed}
            summary={
              <>
                You authorise <strong className="font-mono">{formatAmount(r.amount)} tUSD8</strong> from your wallet to the Autorail router for {r.invoiceNumber}. The authorisation is valid for one hour and can only be used once.
              </>
            }
          />
        )}
        {!rep && (
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <Fuel className="h-4 w-4 text-brand" aria-hidden /> No tQDAY needed: the relayer pays gas.
          </p>
        )}
        <TxStatus stage={tx.stage} hash={tx.hash} error={tx.error} onDismiss={tx.reset} labels={{ signing: "Sign authorization (no gas)", pending: "Relayer submitting", confirmed: "Paid" }} />
        {rep && (
          <div className="rounded-[10px] border border-line p-4">
            <WaterfallBar
              total={rep.total}
              segments={[
                { label: "Vault principal", amount: rep.vaultPrincipal, tone: "brand" },
                { label: "Vault fee", amount: rep.vaultFee, tone: "brand-mid" },
                { label: "Vendor remainder", amount: rep.vendorRemainder, tone: "soft" },
              ]}
              note={`+ ${formatAmount(rep.unspentSwept)} unspent swept from the JobWallet to the vendor.`}
              caption="Repaid in one transaction · reputation updated"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

function Row({ r, action }: { r: Receivable; action: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/app/invoices/${r.id}`} className="font-mono text-[14px] font-medium text-ink hover:text-brand hover:underline">{r.invoiceNumber}</Link>
          <StateBadge state={r.state} />
        </div>
        <p className="mt-0.5 text-[13.5px] text-muted">
          {r.sellerName} · due {formatDate(r.dueDate)}
        </p>
      </div>
      <Amount value={r.amount} className="text-[16px] text-ink" />
      <div className="sm:w-44 sm:text-right">{action}</div>
    </li>
  );
}

export function LabView() {
  const lab = useActor("lab");
  const { data: bal } = useBalances(lab);
  const receivables = useReceivables();
  const [confirming, setConfirming] = useState<Receivable | null>(null);
  const [paying, setPaying] = useState<Receivable | null>(null);
  const mine = receivables.data?.filter((r) => r.buyer.toLowerCase() === lab?.toLowerCase()) ?? [];
  const awaiting = mine.filter((r) => r.state === "Created");
  const toPay = mine.filter((r) => r.state === "Confirmed" || r.state === "Funded" || r.state === "Overdue");
  const paid = mine.filter((r) => r.state === "Repaid");

  return (
    <div className="space-y-6">
      <OnboardCallout role="lab" />
      <FaucetHint balances={bal} gasless />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Awaiting confirmation" eyebrow="EIP-712 · buyer agent" />
          {receivables.isLoading ? (
            <SkeletonRows />
          ) : awaiting.length ? (
            <ul className="-my-4 divide-y divide-line">
              {awaiting.map((r) => (
                <Row key={r.id} r={r} action={<Button size="sm" onClick={() => setConfirming(r)}>Review and confirm</Button>} />
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing to confirm">New invoices from your vendors appear here.</EmptyState>
          )}
        </Card>
        <Card>
          <CardHeader title="To pay" eyebrow="EIP-3009 · gasless" action={bal && <span className="font-mono text-[12.5px] text-muted">Balance {formatAmount(bal.tUSD8)} tUSD8</span>} />
          <p className="mb-4 flex items-center gap-2 rounded-btn border border-brand-line bg-brand-soft/60 px-3 py-2 text-[13px] text-ink">
            <Fuel className="h-4 w-4 shrink-0 text-brand" aria-hidden />
            <span>
              <strong className="font-semibold">Gasless:</strong> you only sign. The relayer pays gas
              {bal && bal.tQDAY === 0n ? ", so your 0.00 tQDAY balance is fine." : "."}
            </span>
          </p>
          {receivables.isLoading ? (
            <SkeletonRows />
          ) : toPay.length ? (
            <ul className="-my-4 divide-y divide-line">
              {toPay.map((r) => (
                <Row key={r.id} r={r} action={<Button size="sm" onClick={() => setPaying(r)}>Pay invoice</Button>} />
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing due">Confirmed invoices appear here until you pay them.</EmptyState>
          )}
        </Card>
      </div>
      <Card>
        <CardHeader title="Paid" eyebrow="Repaid through the router" />
        {paid.length ? (
          <ul className="-my-4 divide-y divide-line">
            {paid.map((r) => (
              <Row key={r.id} r={r} action={<Link href={`/app/invoices/${r.id}`} className="text-[13.5px] font-medium text-brand hover:underline">View waterfall</Link>} />
            ))}
          </ul>
        ) : (
          <EmptyState title="No paid invoices yet" />
        )}
      </Card>
      {confirming && <ConfirmModal r={confirming} onClose={() => setConfirming(null)} />}
      {paying && <PayModal r={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}
