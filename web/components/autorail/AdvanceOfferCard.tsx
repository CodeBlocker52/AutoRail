"use client";
import { Sparkles } from "lucide-react";
import type { Receivable } from "@/lib/autorail/types";
import { pct } from "@/lib/autorail/format";
import { useAdvanceOffer, useClient, useTx } from "@/hooks";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { TxStatus } from "@/components/ui/TxStatus";
import { AutoPayStatus } from "./AutoPayStatus";

/** Underwriter's offer (or the funded terms) with the plain-English explanation. */
export function AdvanceOfferCard({ receivable }: { receivable: Receivable }) {
  const client = useClient();
  const { data: offer, isLoading } = useAdvanceOffer(receivable.id);
  const tx = useTx("Fund advance");
  const funded = !!receivable.advance;
  return (
    <Card>
      <CardHeader
        title={funded ? `Advance on ${receivable.invoiceNumber}` : `Advance offer · ${receivable.invoiceNumber}`}
        eyebrow={offer ? `Underwriting agent #${offer.underwriterAgentId}` : "Underwriting agent"}
        action={offer && <Badge tone={offer.riskBand === "A" ? "solid" : offer.riskBand === "B" ? "brand" : "warning"}>Band {offer.riskBand}</Badge>}
      />
      {isLoading || !offer ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-4">
            {[
              ["Advance", pct(offer.advanceBps)],
              ["Amount", <Amount key="a" value={offer.advanceAmount} />],
              ["Fee", <span key="f">{pct(offer.feeBps)} · <Amount value={offer.feeAmount} symbol={false} /></span>],
              ["Term", `${offer.termDays} days`],
            ].map(([k, v]) => (
              <div key={k as string} className="bg-surface p-3">
                <dt className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-muted">{k}</dt>
                <dd className="mt-1 font-mono text-[15px] text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex gap-3 rounded-[10px] border border-brand-line bg-brand-soft/50 p-4">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
            <div>
              <p className="text-[14.5px] leading-relaxed text-text">{offer.explanation}</p>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                Score {offer.vendorScore}/100 · buyer tier {offer.buyerTier} · rules decide, the LLM explains
              </p>
            </div>
          </div>
          {(receivable.state === "Funded" || receivable.state === "Repaid") && (
            <div className="mt-4">
              <AutoPayStatus receivable={receivable} />
            </div>
          )}
          {!funded && receivable.state === "Confirmed" && (
            <div className="mt-4 space-y-3">
              <Button onClick={() => tx.run((o) => client.fundAdvance(receivable.id, o))} loading={tx.isBusy}>
                Accept and fund advance
              </Button>
              <TxStatus stage={tx.stage} hash={tx.hash} error={tx.error} onDismiss={tx.reset} labels={{ signing: "Underwriter signing", confirmed: "Funded into JobWallet" }} />
            </div>
          )}
        </>
      )}
    </Card>
  );
}
