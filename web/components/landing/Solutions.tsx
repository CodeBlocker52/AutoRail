import { BadgeCheck, Cpu, FileCheck2, KeyRound, Layers, Plus } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { Section, SectionHeader } from "./SectionHeader";

const items = [
  { icon: FileCheck2, title: "Invoice Advance", href: "#invoice-advance" },
  { icon: KeyRound, title: "Agent-Scoped Spending", href: "#scoped-spending" },
  { icon: Layers, title: "Lenders-First Repayment", href: "#repayment" },
  { icon: BadgeCheck, title: "Onchain Credit Reputation", href: "#reputation" },
  { icon: Cpu, title: "x402 Merchant Payments", href: "#x402" },
];

export function Solutions() {
  return (
    <Section id="solutions" labelledBy="solutions-title">
      <SectionHeader eyebrow="What Autorail does" title={<span id="solutions-title">Credit rails built for agents and the labs they serve.</span>} />
      <ul className="mx-auto mt-14 grid max-w-5xl auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it, i) => (
          <li key={it.title} className="h-full">
            <Reveal delay={i * 0.04} className="h-full">
              <a href={it.href} className="group card flex h-full min-h-[172px] flex-col justify-between p-6 transition-all hover:-translate-y-0.5 hover:border-brand-line hover:shadow-lift">
                <span className="grid h-11 w-11 place-items-center rounded-[10px] bg-brand-soft text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                  <it.icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="mt-6 flex items-end justify-between gap-3">
                  <span className="font-serif text-[21px] font-bold leading-[26px] text-ink">{it.title}</span>
                  <span aria-hidden className="shrink-0 font-mono text-[12px] leading-[22px] text-muted transition-colors group-hover:text-brand">0{i + 1}</span>
                </span>
              </a>
            </Reveal>
          </li>
        ))}
        <li className="h-full">
          <Reveal delay={0.2} className="h-full">
            <div className="flex h-full min-h-[172px] flex-col justify-between rounded-card border border-dashed border-line p-6">
              <span className="grid h-11 w-11 place-items-center rounded-[10px] border border-dashed border-line text-muted">
                <Plus className="h-5 w-5" aria-hidden />
              </span>
              <span className="mt-6 flex items-end justify-between gap-3">
                <span className="font-serif text-[21px] font-bold italic leading-[26px] text-muted">More coming soon</span>
                <span className="shrink-0 font-mono text-[11px] uppercase leading-[22px] tracking-[0.15em] text-muted">Fiat payouts</span>
              </span>
            </div>
          </Reveal>
        </li>
      </ul>
    </Section>
  );
}
