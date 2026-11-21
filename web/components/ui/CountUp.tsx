"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { formatAmount } from "@/lib/autorail/format";
import { cn } from "@/lib/cn";

/**
 * Shows a fixed-point bigint and counts up (or down) to each new value.
 * The first render shows the value directly; with reduced motion it never animates.
 */
export function CountUp({ value, decimals = 6, maxFrac, className, duration = 700 }: { value: bigint; decimals?: number; maxFrac?: number; className?: string; duration?: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return;
    if (reduce) {
      setShown(value);
      return;
    }
    setFlash(true);
    const start = performance.now();
    const diff = Number(value - from);
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(p >= 1 ? value : from + BigInt(Math.round(diff * eased)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setTimeout(() => setFlash(false), 600);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce, duration]);

  return (
    <span className={cn("mono rounded transition-colors duration-700", flash && "bg-brand-soft text-brand", className)}>
      {formatAmount(shown, { decimals, maxFrac })}
    </span>
  );
}
