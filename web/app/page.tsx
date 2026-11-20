import { SiteNav } from "@/components/landing/SiteNav";
import { Hero } from "@/components/landing/Hero";
import { CashGap } from "@/components/landing/CashGap";
import { Solutions } from "@/components/landing/Solutions";
import { Features } from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ForLenders } from "@/components/landing/ForLenders";
import { Safety } from "@/components/landing/Safety";
import { FinalCta } from "@/components/landing/FinalCta";
import { SiteFooter } from "@/components/landing/SiteFooter";

export default function LandingPage() {
  return (
    <>
      <SiteNav />
      <main id="main">
        <Hero />
        <CashGap />
        <Solutions />
        <Features />
        <HowItWorks />
        <ForLenders />
        <Safety />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
