"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { latestSettlement, type Settlement } from "@/lib/autorail/proof";
import { formatAmount } from "@/lib/autorail/format";
import { explorerTx } from "@/lib/chain/aevum";

const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-5)}`;

/** One mono line: the latest lab payment that repaid lenders. Hidden if there are none. */
export function ProofStrip() {
  const [s, setS] = useState<Settlement | null>(null);
  useEffect(() => {
    let alive = true;
    latestSettlement()
      .then((x) => alive && setS(x))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  if (!s) return <div className="mt-5 h-5" aria-hidden />;
  const { event, receivable } = s;
  return (
    <p className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-mono text-[11.5px] uppercase tracking-[0.14em] text-muted">
      <span className="inline-flex items-center gap-1.5 text-brand">
        <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden /> Latest settlement
      </span>
      <span aria-hidden>·</span>
      <span>{receivable?.invoiceNumber ?? `#${event.receivableId}`}</span>
      {receivable && (
        <>
          <span aria-hidden>·</span>
          <span>
            {formatAmount(receivable.amount)} <span className="normal-case">tUSD8</span>
          </span>
        </>
      )}
      <span aria-hidden>·</span>
      <a href={explorerTx(event.txHash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 normal-case tracking-normal text-brand underline-offset-2 hover:underline">
        {short(event.txHash)}
        <ArrowUpRight className="h-3 w-3" aria-hidden />
        <span className="sr-only">(view on explorer)</span>
      </a>
      <span aria-hidden>·</span>
      <span>block {event.block.toLocaleString("en-US")}</span>
      {s.mock && <span className="rounded border border-line px-1.5 text-[10px] tracking-[0.1em]">demo data</span>}
    </p>
  );
}
