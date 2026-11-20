import { ButtonLink } from "@/components/ui/Button";

export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-brand py-20 sm:py-28" aria-labelledby="cta-title">
      <svg aria-hidden className="absolute inset-0 h-full w-full opacity-[0.12]">
        <defs>
          <pattern id="cta-grid" width="120" height="120" patternUnits="userSpaceOnUse">
            <path d="M120 0V120M0 120H120" fill="none" stroke="#fff" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#cta-grid)" />
      </svg>
      <div className="relative mx-auto max-w-page px-5 text-center sm:px-8">
        <h2 id="cta-title" className="mx-auto max-w-[16ch] font-serif text-[38px] font-bold leading-[1.08] text-white sm:text-[56px]">
          Finance the work, not the worker.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[17px] text-white/75">Run the full 12-step flow on Aevum testnet, or rehearse it in mock mode first.</p>
        <ButtonLink href="/app" variant="inverted" size="lg" className="mt-9">
          Open App
        </ButtonLink>
      </div>
    </section>
  );
}
