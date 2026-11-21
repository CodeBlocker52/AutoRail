"use client";
import { AlertTriangle } from "lucide-react";
import { useAccount, useSwitchChain } from "wagmi";
import { TARGET_CHAIN_ID, targetChain } from "@/lib/chain/aevum";
import { Button } from "@/components/ui/Button";

/** Prompts a switch to the target chain (Aevum 44005, or the local fork 440050) when a wallet is connected to another chain. */
export function NetworkGuard() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  if (!isConnected || chainId === TARGET_CHAIN_ID) return null;
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-btn border border-warning/30 bg-[#FBF3E2] px-4 py-3 text-[14px] text-warning sm:flex-row sm:items-center">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      <p className="flex-1">
        Your wallet is on chain {chainId}. Autorail runs on <strong>{targetChain.name} ({TARGET_CHAIN_ID})</strong>. Writes are refused until you switch.
      </p>
      <Button size="sm" onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })} loading={isPending}>
        Switch network
      </Button>
    </div>
  );
}
