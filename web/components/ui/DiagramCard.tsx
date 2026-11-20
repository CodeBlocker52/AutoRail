import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** White panel that frames a diagram, with an optional mono header strip and caption. */
export function DiagramCard({ label, meta, caption, children, className, bodyClassName }: { label?: string; meta?: ReactNode; caption?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <figure className={cn("card relative overflow-hidden", className)}>
      {(label || meta) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
            <span aria-hidden className="flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-line" />
              <span className="h-1.5 w-1.5 rounded-full bg-line" />
              <span className="h-1.5 w-1.5 rounded-full bg-brand-line" />
            </span>
            {label}
          </span>
          {meta && <span className="font-mono text-[11px] text-muted">{meta}</span>}
        </div>
      )}
      <div className={cn("p-5 sm:p-7", bodyClassName)}>{children}</div>
      {caption && <figcaption className="border-t border-line bg-bg/60 px-5 py-3 font-mono text-[11.5px] uppercase tracking-[0.14em] text-brand">{caption}</figcaption>}
    </figure>
  );
}
