import { CashGapDiagram } from "@/components/diagrams/CashGapDiagram";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";
import { Section } from "./SectionHeader";

export function CashGap() {
  return (
    <Section id="problem" alt labelledBy="problem-title">
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-20">
        <Reveal className="order-2 lg:order-1">
          <CashGapDiagram />
        </Reveal>
        <Reveal className="order-1 lg:order-2" delay={0.05}>
          <Eyebrow>The problem</Eyebrow>
          <h2 id="problem-title" className="h-display mt-5 text-[34px] sm:text-[44px] lg:text-[50px]">
            Vendors pay every week. Labs pay in sixty days.
          </h2>
          <p className="mt-6 text-[17px] leading-relaxed text-text sm:text-[18px]">
            Data vendors pay annotators, domain experts and GPU bills upfront. Labs pay only after QA, on Net 30–90 terms.
          </p>
          <p className="mt-4 text-[17px] leading-relaxed text-muted sm:text-[18px]">
            Growing vendors run out of cash just as they win bigger contracts. Banks won&apos;t lend against an AI-lab invoice, and cross-border wires are slow.
          </p>
        </Reveal>
      </div>
    </Section>
  );
}
