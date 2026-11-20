import { Gauge, KeyRound, Layers, ListChecks, ScrollText, ShieldCheck, TimerOff } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { Section, SectionHeader } from "./SectionHeader";

const items = [
  { icon: KeyRound, title: "Scoped session keys", body: "Payout agents never hold the vendor's keys, only a session limited to one JobWallet." },
  { icon: Gauge, title: "Hard spend caps", body: "Per-payment and total caps are checked by the contract on every payment." },
  { icon: TimerOff, title: "Expiry & instant revoke", body: "Every session expires, and the vendor can revoke it in one transaction." },
  { icon: ListChecks, title: "Allow-listed payees", body: "Funds move only to approved annotators and merchants, so injected addresses revert." },
  { icon: Layers, title: "Lenders-first waterfall", body: "The router repays vault principal and fee before anything reaches the vendor." },
  { icon: ScrollText, title: "Full onchain audit trail", body: "Every confirmation, payment, revert and repayment links to the explorer." },
];

export function Safety() {
  return (
    <Section id="safety" labelledBy="safety-title">
      <SectionHeader eyebrow="Safety & controls" title={<span id="safety-title">Least privilege by default.</span>} />
      <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it, i) => (
          <li key={it.title}>
            <Reveal delay={i * 0.04} className="card flex h-full flex-col p-6">
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-brand-soft text-brand">
                  <it.icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.15em] text-brand">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Onchain check
                </span>
              </div>
              <h3 className="mt-5 text-[18px] font-semibold text-ink">{it.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{it.body}</p>
            </Reveal>
          </li>
        ))}
      </ul>
    </Section>
  );
}
