import { ArrowDown } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { GridBackdrop } from "@/components/ui/GridBackdrop";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { StatPill } from "@/components/ui/StatPill";
import { Reveal } from "@/components/ui/Reveal";
import { DEPLOYED } from "@/lib/config/contracts";
import { ProofStrip } from "./ProofStrip";

const pills = [
  { value: "Up to 80%", label: "advance on confirmed invoices" },
  { value: "1 transaction", label: "lab payment to lender repayment" },
  { value: "5 agents", label: "with ERC-8004 identities" },
  // Only say "live" once the contracts are deployed (NEXT_PUBLIC_DEPLOYED=true).
  DEPLOYED
    ? { value: "Chain 44005", label: "live on Aevum testnet" }
    : { value: "Chain 44005", label: "· Aevum testnet" },
];
const builtWith = ["QDay Aevum", "tUSD8", "ERC-8004", "ERC-4626", "EIP-712", "EIP-3009"];

export function Hero() {
  return (
    <section
      className="relative overflow-hidden pb-20 pt-12 sm:pb-24 sm:pt-16 lg:pt-[72px]"
      aria-labelledby="hero-title"
    >
      <GridBackdrop />
      <div className="relative mx-auto max-w-page px-5 text-center sm:px-8">
        {/* The headline is the LCP element: rendered visible from the server, no JS-driven fade. */}
        <h1
          id="hero-title"
          className="h-display mx-auto max-w-[15ch] text-[clamp(44px,5vw,72px)] leading-[1.06] tracking-[-0.02em] lg:-mx-12 lg:max-w-none"
        >
          Working capital for the vendors <br className="hidden lg:inline" />
          who train frontier AI
        </h1>
        <Reveal delay={0.08}>
          <p className="mx-auto mt-6 max-w-[640px] text-[17px] leading-relaxed text-text sm:text-[19px]">
            Autorail turns a lab-confirmed invoice into tUSD8 today. Agents can spend it only on
            approved annotators and GPUs, and the lab&apos;s payment repays lenders first, in one
            transaction on QDay Aevum.
          </p>
        </Reveal>
        <Reveal
          delay={0.14}
          className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6"
        >
          <ButtonLink href="/app" size="lg" className="w-full sm:w-auto">
            Open App
          </ButtonLink>
          <a
            href="#how"
            className="inline-flex items-center gap-1.5 text-[15px] font-medium text-brand underline-offset-4 hover:underline"
          >
            See how it works <ArrowDown className="h-4 w-4" aria-hidden />
          </a>
        </Reveal>
        <Reveal delay={0.2} className="mt-12">
          <Eyebrow className="justify-center">Built for the AI data supply chain</Eyebrow>
          <ul className="mx-auto mt-5 flex flex-col items-center gap-2.5 sm:grid sm:w-fit sm:grid-cols-2 sm:gap-3 xl:flex xl:flex-row xl:flex-nowrap">
            {pills.map((p) => (
              <li key={p.value} className="flex justify-center">
                <StatPill value={p.value} label={p.label} />
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-2">
            <span className="mr-2 font-mono text-[11.5px] uppercase tracking-eyebrow text-muted">
              Built with
            </span>
            {builtWith.map((b) => (
              <span
                key={b}
                className="rounded-md border border-line bg-surface/70 px-2.5 py-1 font-mono text-[12px] text-text"
              >
                {b}
              </span>
            ))}
          </div>
          <ProofStrip />
        </Reveal>
      </div>
    </section>
  );
}
