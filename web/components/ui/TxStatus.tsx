"use client";
import { Check, Loader2, PenLine, X } from "lucide-react";
import type { DecodedError, Hash, TxStage } from "@/lib/autorail";
import { TxHashLink } from "./AddressChip";
import { ErrorBanner } from "./ErrorBanner";
import { cn } from "@/lib/cn";

const DEFAULT_LABELS = { signing: "Awaiting signature", pending: "Pending onchain", confirmed: "Confirmed" } as const;

/** idle → awaiting signature → pending → confirmed / failed, with explorer link. Used for every write. */
export function TxStatus({
  stage, hash, error, labels, onDismiss, className,
}: { stage: TxStage; hash?: Hash; error?: DecodedError; labels?: Partial<Record<keyof typeof DEFAULT_LABELS, string>>; onDismiss?: () => void; className?: string }) {
  if (stage === "idle") return null;
  if (stage === "failed") return <ErrorBanner error={error ?? null} onDismiss={onDismiss} className={className} />;
  const L: Record<keyof typeof DEFAULT_LABELS, string> = { ...DEFAULT_LABELS, ...labels };
  const steps = [
    { id: "signing", label: L.signing, icon: PenLine },
    { id: "pending", label: L.pending, icon: Loader2 },
    { id: "confirmed", label: L.confirmed, icon: Check },
  ] as const;
  const idx = steps.findIndex((s) => s.id === stage);
  return (
    <div role="status" aria-live="polite" className={cn("rounded-btn border border-line bg-bg px-3.5 py-3", className)}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {steps.map((s, i) => {
          const done = i < idx || stage === "confirmed";
          const active = i === idx && stage !== "confirmed";
          const Icon = done ? Check : s.icon;
          return (
            <li key={s.id} className="flex items-center gap-2">
              <span
                className={cn(
                  "grid h-5 w-5 place-items-center rounded-full border",
                  done ? "border-brand bg-brand text-white" : active ? "border-brand text-brand" : "border-line text-muted",
                )}
              >
                <Icon className={cn("h-3 w-3", active && s.id === "pending" && "animate-spin")} aria-hidden />
              </span>
              <span className={cn("text-[13px]", done || active ? "font-medium text-ink" : "text-muted")}>{s.label}</span>
              {i < steps.length - 1 && <span aria-hidden className={cn("mx-1 h-px w-5", done ? "bg-brand" : "bg-line")} />}
            </li>
          );
        })}
      </ol>
      {hash && (
        <p className="mt-2 flex items-center gap-2 font-mono text-[11.5px] uppercase tracking-[0.08em] text-muted">
          Tx <TxHashLink hash={hash} className="normal-case tracking-normal" />
        </p>
      )}
    </div>
  );
}

export function TxFailIcon() {
  return <X className="h-4 w-4 text-danger" aria-hidden />;
}
