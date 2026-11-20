import { cn } from "@/lib/cn";

/** 5×5 block monogram: two rails joined by a crossbar, read as a blocky "A". */
export const LOGO_CELLS: [number, number][] = [
  [1, 0], [2, 0], [3, 0],
  [0, 1], [4, 1],
  [0, 2], [1, 2], [2, 2], [3, 2], [4, 2],
  [0, 3], [4, 3],
  [0, 4], [4, 4],
];

export function LogoMark({ size = 32, inverted = false, className }: { size?: number; inverted?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden="true" focusable="false">
      <rect width="40" height="40" rx="7" fill={inverted ? "#FFFFFF" : "rgb(var(--brand))"} />
      {LOGO_CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={8 + x * 5} y={8 + y * 5} width="4" height="4" rx="0.6" fill={inverted ? "rgb(var(--brand))" : "#FFFFFF"} />
      ))}
    </svg>
  );
}

export function Logo({ size = 32, inverted = false, wordmark = true, className }: { size?: number; inverted?: boolean; wordmark?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} inverted={inverted} />
      {wordmark && (
        <span className={cn("font-serif text-[21px] font-bold tracking-tight", inverted ? "text-white" : "text-ink")}>Autorail</span>
      )}
      <span className="sr-only">{wordmark ? "" : "Autorail"}</span>
    </span>
  );
}
