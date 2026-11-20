"use client";
import { useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
}

/** Keyboard-operable tablist (arrow keys, Home/End). Render the panel yourself with tabPanelProps(id). */
export function Tabs<T extends string>({ items, value, onChange, className, size = "md" }: { items: TabItem<T>[]; value: T; onChange: (v: T) => void; className?: string; size?: "sm" | "md" }) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    let n = i;
    if (e.key === "ArrowRight") n = (i + 1) % items.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = items.length - 1;
    else return;
    e.preventDefault();
    refs.current[n]?.focus();
    onChange(items[n].id);
  };
  return (
    <div role="tablist" className={cn("inline-flex rounded-btn border border-line bg-bg-alt p-1", className)}>
      {items.map((t, i) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`${id}-${t.id}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "rounded-[6px] font-medium transition-colors",
              size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3.5 text-[13.5px]",
              selected ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
