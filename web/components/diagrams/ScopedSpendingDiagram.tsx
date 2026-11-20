import { KeyRound } from "lucide-react";
import { DiagramCard } from "@/components/ui/DiagramCard";
import { HubDiagram } from "./HubDiagram";

export function ScopedSpendingDiagram() {
  return (
    <DiagramCard label="JobWallet · session key" meta="cap 1.20 / payment" caption="Off-list, over-cap or revoked: reverts onchain">
      <HubDiagram
        hub="Payout agent"
        hubSub="session key"
        hubIcon={<KeyRound className="h-4 w-4" aria-hidden />}
        spokes={[
          { label: "Annotator A", sub: "1.00 · paid", variant: "ok" },
          { label: "Annotator B", sub: "1.00 · paid", variant: "ok" },
          { label: "GPU merchant", sub: "0.80 · x402", variant: "ok" },
          { label: "0.20 to 0xBAD…", sub: "payee not allowed", variant: "blocked" },
          { label: "1.50 to GPU", sub: "over cap", variant: "blocked" },
          { label: "After revoke", sub: "session revoked", variant: "blocked" },
        ]}
      />
    </DiagramCard>
  );
}
