"use client";
import { motion, useReducedMotion } from "framer-motion";
import { DiagramCard } from "@/components/ui/DiagramCard";
import { cn } from "@/lib/cn";

const lines = [
  { dir: "→", text: "POST /v1/gpu/jobs", meta: "payout agent #11", tone: "text" },
  { dir: "←", text: "HTTP 402 Payment Required", meta: "0.80 tUSD8 · payTo 0x7c2e…e1a4", tone: "warn" },
  { dir: "→", text: "JobWallet.pay(0x7c2e…e1a4, 0.80)", meta: "payee ✓ · cap 1.20 ✓ · expiry ✓", tone: "brand" },
  { dir: "←", text: "tx 0x51d0…8a3f confirmed", meta: "block 1,284,372", tone: "brand" },
  { dir: "→", text: "POST /v1/gpu/jobs  X-PAYMENT: 0x51d0…", meta: "retry with receipt", tone: "text" },
  { dir: "←", text: "HTTP 200 OK", meta: "job_4471 · result ready", tone: "ok" },
] as const;

export function X402Diagram() {
  const reduce = useReducedMotion();
  return (
    <DiagramCard label="x402 request log" meta="kestrel-gpu.example" bodyClassName="!p-0">
      <ol className="divide-y divide-line font-mono text-[12px]">
        {lines.map((l, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -6 }}
            whileInView={{ opacity: 1, x: 0 }}
            animate={reduce ? { opacity: 1, x: 0 } : undefined}
            viewport={{ once: true }}
            transition={reduce ? { duration: 0 } : { delay: 0.15 + i * 0.18, duration: 0.35 }}
            className={cn("grid grid-cols-[18px_1fr] gap-x-2 px-5 py-2.5 sm:grid-cols-[18px_1fr_auto]", l.tone === "warn" && "bg-[#FBF3E2]/60", l.tone === "ok" && "bg-brand-soft/70")}
          >
            <span className={cn(l.dir === "→" ? "text-muted" : "text-brand")}>{l.dir}</span>
            <span className={cn("truncate", l.tone === "warn" ? "text-warning" : l.tone === "ok" ? "font-semibold text-brand" : "text-ink")}>{l.text}</span>
            <span className="col-start-2 truncate text-[11px] text-muted sm:col-start-3">{l.meta}</span>
          </motion.li>
        ))}
      </ol>
    </DiagramCard>
  );
}
