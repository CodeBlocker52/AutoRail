import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { InvoiceAdvanceDiagram } from "@/components/diagrams/InvoiceAdvanceDiagram";
import { ScopedSpendingDiagram } from "@/components/diagrams/ScopedSpendingDiagram";
import { WaterfallDiagram } from "@/components/diagrams/WaterfallDiagram";
import { ReputationDiagram } from "@/components/diagrams/ReputationDiagram";
import { X402Diagram } from "@/components/diagrams/X402Diagram";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";
import { SectionRail } from "@/components/ui/SectionRail";
import { cn } from "@/lib/cn";

interface Feature {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  diagram: ReactNode;
}

export const FEATURES: Feature[] = [
  {
    id: "invoice-advance",
    eyebrow: "Invoice advance",
    title: "From lab invoice to working capital in one confirmation.",
    body: "The vendor's seller agent creates the invoice. The lab's buyer agent confirms it with one EIP-712 signature that names the Autorail router as payee, and the underwriting agent prices the advance.",
    bullets: [
      "Up to 80% advance, priced from ERC-8004 reputation and buyer tier",
      "Only the invoice hash goes onchain; the file stays private",
      "Duplicate invoices and self-dealing are rejected by the registry",
      "Deterministic pricing rules; the LLM only explains the offer",
    ],
    diagram: <InvoiceAdvanceDiagram />,
  },
  {
    id: "scoped-spending",
    eyebrow: "Agent-scoped spending",
    title: "Agents spend only what the job allows.",
    body: "The advance lands in a per-invoice JobWallet. The vendor grants its payout agent a session key with hard limits, enforced by the contract rather than the agent.",
    bullets: [
      "Approved payees only, with a per-payment cap and a total cap",
      "Expiry on every session, and instant revoke by the vendor",
      "Prompt-injection safe: an injected payee simply reverts",
      "Every attempt, allowed or blocked, is visible onchain",
    ],
    diagram: <ScopedSpendingDiagram />,
  },
  {
    id: "repayment",
    eyebrow: "Lenders-first repayment",
    title: "The lab pays once. Lenders are paid first.",
    body: "The lab's buyer agent pays with a gasless EIP-3009 signature. In the same transaction the router repays the vault's principal and fee, then sends the rest to the vendor.",
    bullets: [
      "Payment is locked to the router by the signed confirmation",
      "Vault principal, then fee, then vendor remainder",
      "Unspent JobWallet balance is swept back at repayment",
    ],
    diagram: <WaterfallDiagram />,
  },
  {
    id: "reputation",
    eyebrow: "Onchain credit reputation",
    title: "Every repayment makes the next advance cheaper.",
    body: "The router writes the outcome to the ERC-8004 Reputation Registry. Vendors build a portable credit history that any underwriter can read.",
    bullets: [
      "On-time, late or defaulted: recorded as ERC-8004 feedback",
      "Advance limits rise with a clean history",
      "Overdue invoices can be flagged by anyone after the grace period",
    ],
    diagram: <ReputationDiagram />,
  },
  {
    id: "x402",
    eyebrow: "x402 merchant payments",
    title: "Pay GPU jobs and data APIs per request.",
    body: "Merchant agents answer with HTTP 402 and a price. The payout agent settles from the JobWallet within its session limits, then retries with the receipt.",
    bullets: [
      "Pay-per-request GPU jobs and dataset APIs",
      "Same caps and allow-list as every other payment",
      "Each settlement links to its transaction on the explorer",
    ],
    diagram: <X402Diagram />,
  },
];

export function Features() {
  return (
    <div id="features" className="relative">
      <SectionRail sections={FEATURES.map((f) => ({ id: f.id, label: f.eyebrow }))} />
      {FEATURES.map((f, i) => (
        <section key={f.id} id={f.id} aria-labelledby={`${f.id}-title`} className={cn("relative py-20 sm:py-28 lg:py-[128px]", i % 2 === 1 ? "bg-bg-alt" : "bg-bg")}>
          <div className="mx-auto grid max-w-page grid-cols-1 items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20">
            <Reveal className={cn(i % 2 === 1 && "lg:order-2")}>
              <Eyebrow>{f.eyebrow}</Eyebrow>
              <h2 id={`${f.id}-title`} className="h-display mt-5 text-[32px] sm:text-[40px] lg:text-[46px]">
                {f.title}
              </h2>
              <p className="mt-6 text-[17px] leading-relaxed text-text sm:text-[18px]">{f.body}</p>
              <ul className="mt-7 space-y-3">
                {f.bullets.map((b) => (
                  <li key={b} className="flex gap-3 text-[16px] text-text">
                    <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                      <Check className="h-3 w-3" aria-hidden />
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={0.08} className={cn(i % 2 === 1 && "lg:order-1")}>
              {f.diagram}
            </Reveal>
          </div>
        </section>
      ))}
    </div>
  );
}
