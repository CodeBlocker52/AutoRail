"use client";
import { useId } from "react";
import { formatAmount, parseTokenInput, toInputString } from "@/lib/autorail/format";
import { cn } from "@/lib/cn";

/** Bigint-safe amount input. Value is the raw string; parse with parseTokenInput. */
export function TokenInput({
  label, value, onChange, balance, max, symbol = "tUSD8", hint, disabled, id: idProp, error: errorProp,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  balance?: bigint;
  max?: bigint;
  symbol?: string;
  hint?: string;
  disabled?: boolean;
  id?: string;
  error?: string;
}) {
  const auto = useId();
  const id = idProp ?? auto;
  const parsed = value ? parseTokenInput(value) : 0n;
  const limit = max ?? balance;
  const error = errorProp ?? (value && parsed === null ? "Use a number with up to 6 decimals." : parsed !== null && limit !== undefined && parsed > limit ? `Above the available ${formatAmount(limit)} ${symbol}.` : undefined);
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="label !mb-0">{label}</label>
        {balance !== undefined && (
          <span className="font-mono text-[12px] text-muted">
            Balance {formatAmount(balance)} {symbol}
          </span>
        )}
      </div>
      <div className={cn("flex h-12 items-center rounded-btn border bg-surface pr-1.5 focus-within:ring-2", error ? "border-danger focus-within:ring-danger/20" : "border-line focus-within:border-brand focus-within:ring-brand/20")}>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error || hint ? `${id}-msg` : undefined}
          onChange={(e) => {
            const v = e.target.value.replace(",", ".");
            if (/^\d*\.?\d{0,6}$/.test(v)) onChange(v);
          }}
          className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-[17px] text-ink outline-none placeholder:text-muted/60"
        />
        <span className="px-2 font-mono text-[13px] text-muted">{symbol}</span>
        {limit !== undefined && (
          <button type="button" disabled={disabled} onClick={() => onChange(toInputString(limit))} className="h-8 rounded-[6px] border border-brand-line bg-brand-soft px-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-brand hover:bg-brand hover:text-white">
            Max
          </button>
        )}
      </div>
      {(error || hint) && (
        <p id={`${id}-msg`} className={cn("mt-1.5 text-[12.5px]", error ? "text-danger" : "text-muted")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
