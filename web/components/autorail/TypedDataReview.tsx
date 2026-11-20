"use client";
import { useState } from "react";
import { ChevronDown, FileSignature } from "lucide-react";
import type { ReactNode } from "react";
import type { TypedDataPayload } from "@/lib/autorail/types";
import { stringifyBig } from "@/lib/autorail/format";
import { cn } from "@/lib/cn";

/** Plain-English summary of what is being signed, with a toggle for the raw EIP-712 payload. */
export function TypedDataReview({ summary, typedData, standard = "EIP-712", className }: { summary: ReactNode; typedData?: TypedDataPayload; standard?: string; className?: string }) {
  const [raw, setRaw] = useState(false);
  return (
    <div className={cn("rounded-[10px] border border-line", className)}>
      <div className="flex gap-3 p-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand-soft text-brand">
          <FileSignature className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted">You are signing · {standard}</p>
          <div className="mt-1 text-[15px] leading-relaxed text-ink">{summary}</div>
        </div>
      </div>
      {typedData && (
        <>
          <button type="button" onClick={() => setRaw((r) => !r)} aria-expanded={raw} className="flex w-full items-center justify-between border-t border-line px-4 py-2.5 text-[13px] font-medium text-brand hover:bg-brand-soft/40">
            {raw ? "Hide raw typed data" : "View raw typed data"}
            <ChevronDown className={cn("h-4 w-4 transition-transform", raw && "rotate-180")} aria-hidden />
          </button>
          {raw && (
            <pre className="max-h-64 overflow-auto border-t border-line bg-bg px-4 py-3 font-mono text-[11.5px] leading-relaxed text-text">
              {stringifyBig({ domain: typedData.domain, primaryType: typedData.primaryType, types: typedData.types, message: typedData.message })}
            </pre>
          )}
        </>
      )}
    </div>
  );
}
