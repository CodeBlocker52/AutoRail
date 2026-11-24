"use client";
import { ArrowRight, Sparkles } from "lucide-react";
import { useAccount } from "wagmi";
import { useAutorailQuery, useClient } from "@/hooks/useClient";
import { ButtonLink } from "@/components/ui/Button";

/**
 * Live mode: if the connected wallet has no agent with this role yet, point it to self-serve onboarding.
 * Renders nothing in demo mode, when disconnected, or once the wallet is onboarded.
 */
export function OnboardCallout({ role }: { role: "vendor" | "lab" }) {
  const { address } = useAccount();
  const client = useClient();
  const status = useAutorailQuery(["onboarding", address], (c) => c.getOnboardingStatus!(address!), !!address && !!client.getOnboardingStatus);
  if (!address || !status.data) return null;
  const has = role === "vendor" ? status.data.seller : status.data.buyer;
  if (has !== null) return null;
  return (
    <div className="flex flex-col gap-3 rounded-card border border-brand-line bg-brand-soft/40 p-4 sm:flex-row sm:items-center">
      <Sparkles className="h-5 w-5 shrink-0 text-brand" aria-hidden />
      <p className="flex-1 text-[14px] text-text">
        <strong className="text-ink">This wallet isn&apos;t a {role === "vendor" ? "vendor" : "lab"} yet.</strong> Register an ERC-8004 agent from your wallet and get the{" "}
        {role === "vendor" ? "Seller" : "Buyer"} role in about a minute.
      </p>
      <ButtonLink href={`/app/onboard?role=${role}`} size="sm" icon={<ArrowRight className="h-3.5 w-3.5" />}>
        Get started
      </ButtonLink>
    </div>
  );
}
