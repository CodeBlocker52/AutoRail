import type { ReactNode } from "react";
import { ConfirmDiagram, FundDiagram, RegisterDiagram, RepayDiagram } from "@/components/diagrams/HowItWorksDiagrams";
import { GridBackdrop } from "@/components/ui/GridBackdrop";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import { SectionHeader } from "./SectionHeader";

const steps: { title: string; body: string; diagram: ReactNode }[] = [
  { title: "Agents register", body: "Seller, buyer, underwriter, payout and merchant agents each get an ERC-8004 identity, so every action has a known actor.", diagram: <RegisterDiagram /> },
  { title: "Lab confirms the invoice", body: "The vendor's agent submits the invoice hash. The lab's buyer agent signs an EIP-712 confirmation that fixes the amount, due date and the Autorail router as payee.", diagram: <ConfirmDiagram /> },
  { title: "Vault funds a scoped JobWallet", body: "The underwriting agent prices the advance and the vault funds a per-invoice JobWallet. The vendor grants its payout agent a capped, expiring session key.", diagram: <FundDiagram /> },
  { title: "Lab pays, lenders first, reputation updates", body: "One gasless EIP-3009 signature. The router repays principal and fee to the vault, sends the rest to the vendor, and records the result on ERC-8004.", diagram: <RepayDiagram /> },
];

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="relative overflow-hidden bg-bg py-20 sm:py-28 lg:py-[136px]">
      <GridBackdrop fade="bottom" className="h-[520px]" />
      <div className="relative mx-auto max-w-page px-5 sm:px-8">
        <SectionHeader eyebrow="How it works" title={<span id="how-title">A credit layer, not a new back office.</span>}>
          Vendors, labs and lenders keep their tools. Autorail adds the rails between them.
        </SectionHeader>
        <ol className="mt-16 space-y-16 sm:mt-20 lg:space-y-24">
          {steps.map((s, i) => (
            <li key={s.title} className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-20">
              <Reveal className={cn(i % 2 === 1 && "lg:order-2")}>
                <p className="font-mono text-[13px] uppercase tracking-eyebrow text-brand">Step {String(i + 1).padStart(2, "0")}</p>
                <h3 className="h-display mt-3 text-[28px] sm:text-[34px]">{s.title}</h3>
                <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-text">{s.body}</p>
              </Reveal>
              <Reveal delay={0.06} className={cn(i % 2 === 1 && "lg:order-1")}>
                {s.diagram}
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
