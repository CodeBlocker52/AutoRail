"use client";
import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Ban, CircleCheck, Info } from "lucide-react";
import type { ActivityEvent } from "@/lib/autorail/types";
import { formatEventTime } from "@/lib/autorail/format";
import { TxHashLink } from "@/components/ui/AddressChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";

/**
 * Mono event log. Blocked attempts are danger-soft rows with the plain-English revert reason.
 * Rows that arrive after the first render slide in (no motion with prefers-reduced-motion).
 */
export function EventLog({ events, className, maxHeight, compact, emptyText = "No events yet." }: { events: ActivityEvent[]; className?: string; maxHeight?: number; compact?: boolean; emptyText?: string }) {
  const reduce = useReducedMotion();
  const seen = useRef<Set<string> | null>(null);
  if (seen.current === null) seen.current = new Set(events.map((e) => e.id));
  const known = seen.current;
  useEffect(() => {
    events.forEach((e) => known.add(e.id));
  }, [events, known]);

  if (!events.length) return <EmptyState title={emptyText} className={className} />;
  return (
    <ol className={cn("divide-y divide-line overflow-y-auto overflow-x-hidden rounded-[10px] border border-line bg-surface font-mono text-[12.5px]", className)} style={maxHeight ? { maxHeight } : undefined} aria-live="polite">
      {events.map((e) => {
        const blocked = e.status === "blocked";
        const Icon = blocked ? Ban : e.status === "info" ? Info : CircleCheck;
        const fresh = !known.has(e.id) && !reduce;
        const full = [e.title, blocked && e.revertReason ? `reverted: ${e.revertReason}` : null, e.detail].filter(Boolean).join("\n");
        return (
          <motion.li
            key={e.id}
            initial={fresh ? { opacity: 0, x: -14, backgroundColor: blocked ? "rgb(247 236 234)" : "rgb(232 238 234)" } : false}
            animate={{ opacity: 1, x: 0, backgroundColor: blocked ? "rgb(247 236 234)" : "rgb(255 255 255)" }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], backgroundColor: { duration: 1.6 } }}
            title={full}
            className={cn("grid grid-cols-[auto_1fr] gap-x-3 px-3.5", compact ? "py-2" : "py-2.5", blocked && "bg-danger-soft")}
          >
            <div className="flex items-center gap-2 pt-px">
              <time dateTime={new Date(e.timestamp * 1000).toISOString()} className="hidden whitespace-nowrap text-[11.5px] text-muted sm:inline">
                {formatEventTime(e.timestamp)}
              </time>
              <Icon className={cn("h-3.5 w-3.5 shrink-0", blocked ? "text-danger" : e.status === "info" ? "text-muted" : "text-brand")} aria-label={blocked ? "Blocked" : e.status === "info" ? "Info" : "Confirmed"} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className={cn("min-w-0 font-sans text-[13.5px]", blocked ? "font-medium text-danger" : "text-ink")}>{e.title}</p>
                <TxHashLink hash={e.txHash} className={cn("text-[11.5px]", blocked && "!text-danger")} />
              </div>
              <p className="text-[11px] text-text/80 sm:hidden">{formatEventTime(e.timestamp)}</p>
              {blocked && e.revertReason && <p className="mt-0.5 line-clamp-2 text-[11.5px] text-danger">↳ reverted: {e.revertReason}</p>}
              {!compact && e.detail && <p className={cn("mt-0.5 line-clamp-2 break-words text-[11.5px]", blocked ? "text-danger" : "text-muted")}>{e.detail}</p>}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
