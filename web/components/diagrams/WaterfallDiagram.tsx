import { CornerDownRight } from "lucide-react";
import { DiagramCard } from "@/components/ui/DiagramCard";
import { WaterfallBar } from "@/components/ui/WaterfallBar";
import { tusd } from "@/lib/autorail/format";

export function WaterfallDiagram() {
  return (
    <DiagramCard label="Repayment router · waterfall" meta="INV-001" caption="One EIP-3009 signature. One transaction.">
      <WaterfallBar
        total={tusd("4.00")}
        segments={[
          { label: "Vault principal", amount: tusd("3.00"), tone: "brand" },
          { label: "Vault fee", amount: tusd("0.06"), tone: "brand-mid" },
          { label: "Vendor remainder", amount: tusd("0.94"), tone: "soft" },
        ]}
      />
      <div className="mt-5 flex items-start gap-2.5 rounded-[10px] border border-dashed border-brand-line bg-bg/60 px-3.5 py-3">
        <CornerDownRight className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
        <p className="text-[13.5px] text-text">
          <span className="font-mono text-ink">+ 0.20</span> unspent in the JobWallet is swept back to the vendor in the same transaction.
        </p>
      </div>
    </DiagramCard>
  );
}
