import { BadgeCheck, FileText, PenLine, Scale } from "lucide-react";
import { DiagramCard } from "@/components/ui/DiagramCard";

const steps = [
  { icon: FileText, title: "Invoice INV-001", body: "Lumen Data → Frontier Lab · 4.00 tUSD8 · due 19 Jan 2027", status: "state: Created · hash 0x9c1e…04ab" },
  { icon: PenLine, title: "Buyer agent signature", badge: "EIP-712", body: "Confirms the debt and names the Autorail router as payee", status: "sig: 0x8f3a…c21 · payee = router ✓" },
  { icon: Scale, title: "Underwriting agent", body: "Reads ERC-8004 reputation and the buyer tier", status: "score 50 · tier 1 → band B" },
  { icon: BadgeCheck, title: "Advance 75% · 3.00 tUSD8", body: "Fee 2% · funded into a per-invoice JobWallet", status: "state: Funded · JobWallet 0x4b7d…91e0", final: true },
];

export function InvoiceAdvanceDiagram() {
  return (
    <DiagramCard label="Invoice advance" meta="chain 44005">
      <ol className="relative space-y-3">
        <span aria-hidden className="absolute bottom-6 left-[19px] top-6 w-px border-l border-dashed border-brand-line" />
        {steps.map((s) => (
          <li key={s.title} className="relative flex gap-3.5">
            <span className={`relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border ${s.final ? "border-brand bg-brand text-white" : "border-brand-line bg-brand-soft text-brand"}`}>
              <s.icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <div className={`min-w-0 flex-1 rounded-[10px] border px-3.5 py-2.5 ${s.final ? "border-brand-line bg-brand-soft/60" : "border-line bg-surface"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[14.5px] font-semibold text-ink">{s.title}</p>
                {s.badge && <span className="rounded border border-brand-line bg-surface px-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-brand">{s.badge}</span>}
              </div>
              <p className="text-[13px] text-muted">{s.body}</p>
              <p className="mt-1 truncate font-mono text-[11px] text-brand">{s.status}</p>
            </div>
          </li>
        ))}
      </ol>
    </DiagramCard>
  );
}
