import { formatAmount } from "@/lib/autorail/format";
import { cn } from "@/lib/cn";

/** Formats a 6-decimal tUSD8 bigint (or any fixed-point bigint) in mono. */
export function Amount({
  value, symbol = "tUSD8", decimals = 6, maxFrac = 2, sign, className, symbolClassName,
}: { value: bigint | undefined; symbol?: string | false; decimals?: number; maxFrac?: number; sign?: boolean; className?: string; symbolClassName?: string }) {
  if (value === undefined) return <span className={cn("mono text-muted", className)}>—</span>;
  return (
    <span className={cn("mono whitespace-nowrap", className)}>
      {formatAmount(value, { decimals, maxFrac, sign })}
      {symbol && <span className={cn("ml-1 text-[0.8em] text-muted", symbolClassName)}>{symbol}</span>}
    </span>
  );
}
