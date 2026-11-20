import { ArrowRight, Landmark } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";

const stats = [
  { k: "Vault assets", v: "6.00", u: "tUSD8" },
  { k: "Utilisation", v: "50", u: "%" },
  { k: "Est. APY", v: "6.1", u: "%" },
  { k: "Active advances", v: "1", u: "" },
];

/** Static lender-dashboard preview using the demo scenario numbers. */
export function VaultCardMock() {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-brand text-white">
            <Landmark className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-ink">Autorail Vault</p>
            <p className="font-mono text-[11px] text-muted">ERC-4626 · tUSD8 · Aevum 44005</p>
          </div>
        </div>
        <span className="rounded-full border border-line px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.15em] text-muted">Demo scenario</span>
      </div>
      <dl className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
        {stats.map((s) => (
          <div key={s.k} className="border-b border-line px-5 py-5 sm:border-b-0 sm:px-6">
            <dt className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted">{s.k}</dt>
            <dd className="mt-2 font-mono text-[28px] leading-none text-ink">
              {s.v}
              <span className="ml-1 text-[13px] text-muted">{s.u}</span>
            </dd>
          </div>
        ))}
      </dl>
      <div className="px-5 pb-2 pt-5 sm:px-6">
        <div className="mb-1.5 flex justify-between font-mono text-[11px] text-muted">
          <span>Deployed 3.00</span>
          <span>Idle 3.00</span>
        </div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-bg-alt">
          <div className="h-full w-1/2 bg-brand" />
        </div>
      </div>
      <div className="overflow-x-auto px-5 py-4 sm:px-6">
        <table className="w-full min-w-[420px] text-left text-[13.5px]">
          <thead>
            <tr className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-muted">
              <th className="py-2 font-medium">Invoice</th>
              <th className="py-2 font-medium">Vendor</th>
              <th className="py-2 text-right font-medium">Advance</th>
              <th className="py-2 text-right font-medium">Fee</th>
              <th className="py-2 text-right font-medium">Due</th>
            </tr>
          </thead>
          <tbody className="font-mono text-[12.5px]">
            <tr className="border-t border-line">
              <td className="py-2.5 text-ink">INV-001</td>
              <td className="py-2.5 font-sans text-text">Lumen Data</td>
              <td className="py-2.5 text-right text-ink">3.00</td>
              <td className="py-2.5 text-right text-brand">0.06</td>
              <td className="py-2.5 text-right text-muted">19 Jan 2027</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 border-t border-line bg-bg/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-[13px] text-muted">Numbers from the 12-step demo scenario on testnet.</p>
        <ButtonLink href="/app/lend" size="sm" icon={<ArrowRight className="h-4 w-4" aria-hidden />}>
          Open lender dashboard
        </ButtonLink>
      </div>
    </div>
  );
}
