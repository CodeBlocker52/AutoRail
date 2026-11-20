"use client";
import { AlertTriangle, X } from "lucide-react";
import type { DecodedError } from "@/lib/autorail/errors";
import { TxHashLink } from "./AddressChip";
import { cn } from "@/lib/cn";

/** Shows a plain-English error (see lib/autorail/errors.ts) with the revert code and tx link. */
export function ErrorBanner({ error, onDismiss, className }: { error: DecodedError | null | undefined; onDismiss?: () => void; className?: string }) {
  if (!error) return null;
  const isRevert = !!error.txHash && error.code !== "UserRejected";
  return (
    <div role="alert" className={cn("flex items-start gap-3 rounded-btn border border-danger/30 bg-danger-soft px-3.5 py-3 text-[14px] text-danger", className)}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{error.message}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11.5px] uppercase tracking-[0.08em] text-danger">
          <span>{isRevert ? `Reverted · ${error.code}` : error.code}</span>
          {error.txHash && <TxHashLink hash={error.txHash} className="!text-danger normal-case tracking-normal" />}
        </p>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="grid h-6 w-6 place-items-center rounded hover:bg-danger/10" aria-label="Dismiss error">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
