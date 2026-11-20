"use client";
import { AlertTriangle } from "lucide-react";
import { useAccount, useSwitchChain } from "wagmi";
import { AEVUM_CHAIN_ID } from "@/lib/chain/aevum";
import { Button } from "@/components/ui/Button";

/** Prompts a switch to Aevum (44005) when a wallet is connected to another chain. */
export function NetworkGuard() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  if (!isConnected || chainId === AEVUM_CHAIN_ID) return null;
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-btn border border-warning/30 bg-[#FBF3E2] px-4 py-3 text-[14px] text-warning sm:flex-row sm:items-center">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      <p className="flex-1">
        Your wallet is on chain {chainId}. Autorail runs on <strong>QDay Aevum testnet (44005)</strong>.
      </p>
      <Button size="sm" onClick={() => switchChain({ chainId: AEVUM_CHAIN_ID })} loading={isPending}>
        Switch to Aevum
      </Button>
    </div>
  );
}
