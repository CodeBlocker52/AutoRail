import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Faint editorial grid: 1px lines on a wide column rhythm, dot nodes at some
 * intersections and a few diagonal connector strokes. Fades out toward the edges.
 */
export function GridBackdrop({ className, fade = "radial", cell = 120 }: { className?: string; fade?: "radial" | "bottom" | "none"; cell?: number }) {
  const id = useId().replace(/:/g, "");
  const big = cell * 6;
  const mask =
    fade === "radial"
      ? "radial-gradient(ellipse 75% 70% at 50% 40%, #000 35%, transparent 100%)"
      : fade === "bottom"
        ? "linear-gradient(to bottom, #000 40%, transparent 100%)"
        : undefined;
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}>
      <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={`g-${id}`} width={cell} height={cell} patternUnits="userSpaceOnUse" x="50%">
            <path d={`M${cell} 0V${cell}M0 ${cell}H${cell}`} fill="none" stroke="rgb(var(--line))" strokeOpacity="0.6" strokeWidth="1" />
          </pattern>
          <pattern id={`n-${id}`} width={big} height={cell * 4} patternUnits="userSpaceOnUse" x="50%">
            <g fill="rgb(var(--brand-line))">
              <rect x={cell * 1 - 2.5} y={cell * 1 - 2.5} width="5" height="5" />
              <rect x={cell * 4 - 2.5} y={cell * 2 - 2.5} width="5" height="5" />
              <rect x={cell * 2 - 2} y={cell * 3 - 2} width="4" height="4" fill="rgb(var(--line))" />
              <rect x={cell * 5 - 2} y={cell * 0 - 2} width="4" height="4" fill="rgb(var(--line))" />
            </g>
            <path d={`M${cell} ${cell}L${cell * 2} ${cell * 2}M${cell * 4} ${cell * 2}L${cell * 5} ${cell}`} stroke="rgb(var(--brand-line))" strokeOpacity="0.7" strokeWidth="1" fill="none" />
            <path d={`M${cell * 2} ${cell * 3}L${cell * 3} ${cell * 4}`} stroke="rgb(var(--line))" strokeWidth="1" fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#g-${id})`} />
        <rect width="100%" height="100%" fill={`url(#n-${id})`} />
      </svg>
    </div>
  );
}
