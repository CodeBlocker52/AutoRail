import { Droplets } from "lucide-react";
import type { Balances } from "@/lib/autorail/types";
import { ONE_TUSD8 } from "@/lib/autorail/format";
import { SITE } from "@/lib/config/contracts";
import { cn } from "@/lib/cn";

const LOW_QDAY = 10n ** 16n; // 0.01 tQDAY

/** Shown when tUSD8 or tQDAY is low. tUSD8 is scarce: 1 per claim per 24h on the web faucet. */
export function FaucetHint({ balances, className, gasless }: { balances?: Balances; className?: string; gasless?: boolean }) {
  if (!balances) return null;
  const lowUsd = balances.tUSD8 < ONE_TUSD8;
  const lowGas = !gasless && balances.tQDAY < LOW_QDAY;
  if (!lowUsd && !lowGas) return null;
  const what = [lowUsd && "tUSD8", lowGas && "tQDAY"].filter(Boolean).join(" and ");
  return (
    <div className={cn("flex items-start gap-2.5 rounded-btn border border-brand-line bg-brand-soft/70 px-3 py-2.5 text-[13px] text-text", className)}>
      <Droplets className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
      <p>
        Low on {what}.{" "}
        <a href={SITE.faucetUrl} target="_blank" rel="noreferrer" className="font-medium text-brand underline underline-offset-2">
          Claim from the faucet
        </a>{" "}
        (1 tUSD8 per 24h) or ask in the QDay Discord.
      </p>
    </div>
  );
}
