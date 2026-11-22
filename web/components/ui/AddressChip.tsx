"use client";
import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { explorerAddress, explorerTx, noExplorerLabel } from "@/lib/chain/aevum";
import { shortAddr, shortHash } from "@/lib/autorail/format";
import { cn } from "@/lib/cn";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="relative grid h-6 w-6 place-items-center rounded text-muted hover:bg-ink/5 hover:text-ink"
      aria-label={done ? "Copied" : `Copy ${label}`}
    >
      {done ? <Check className="h-3.5 w-3.5 text-brand" /> : <Copy className="h-3.5 w-3.5" />}
      {done && (
        <span
          role="status"
          className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 animate-[toast-in_.15s_ease-out] whitespace-nowrap rounded bg-ink px-2 py-1 font-sans text-[11px] font-medium text-white shadow-lift"
        >
          Copied
        </span>
      )}
    </button>
  );
}

export function AddressChip({
  address,
  label,
  className,
  link = true,
  copy = true,
}: {
  address: string;
  label?: string;
  className?: string;
  link?: boolean;
  copy?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-0.5 rounded-md border border-line bg-surface pl-2 pr-0.5 font-mono text-[12.5px] text-text",
        className,
      )}
    >
      {label && (
        <span className="mr-1 truncate font-sans text-[12.5px] font-medium text-ink">{label}</span>
      )}
      <span title={address} className="tabular-nums">
        {shortAddr(address)}
      </span>
      {copy && <CopyButton value={address} label="address" />}
      {link && explorerAddress(address) && (
        <a
          href={explorerAddress(address)!}
          target="_blank"
          rel="noreferrer"
          className="grid h-6 w-6 place-items-center rounded text-muted hover:bg-ink/5 hover:text-brand"
          aria-label="View address on explorer"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </span>
  );
}

export function TxHashLink({
  hash,
  className,
  short = true,
}: {
  hash: string;
  className?: string;
  short?: boolean;
}) {
  const href = explorerTx(hash);
  if (!href) {
    // fork / mock: no explorer has this tx; show the hash with a copy button
    return (
      <span
        title={`${hash} (${noExplorerLabel()})`}
        className={cn(
          "inline-flex items-center gap-1 font-mono text-[12.5px] tabular-nums text-text",
          className,
        )}
      >
        {short ? shortHash(hash) : hash}
        <CopyButton value={hash} label="transaction hash" />
        <span className="font-sans text-[11px] text-muted">{noExplorerLabel()}</span>
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={hash}
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[12.5px] tabular-nums text-brand underline-offset-2 hover:underline",
        className,
      )}
    >
      {short ? shortHash(hash) : hash}
      <ExternalLink className="h-3 w-3" aria-hidden />
      <span className="sr-only">(opens explorer)</span>
    </a>
  );
}
