import { ArrowRight, Check, KeyRound, Landmark, PenLine, Wallet } from "lucide-react";
import { DiagramCard } from "@/components/ui/DiagramCard";

const agents = [
  { id: 12, name: "Seller", who: "Lumen Data" },
  { id: 7, name: "Buyer", who: "Frontier Lab" },
  { id: 3, name: "Underwriter", who: "Autorail" },
  { id: 11, name: "Payout", who: "session key" },
  { id: 9, name: "GPU merchant", who: "x402" },
];

export function RegisterDiagram() {
  return (
    <DiagramCard label="ERC-8004 · identity registry">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {agents.map((a) => (
          <li key={a.id} className="rounded-[10px] border border-line bg-surface p-3">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-brand">#{a.id}</p>
            <p className="mt-1 text-[14px] font-semibold text-ink">{a.name}</p>
            <p className="text-[12px] text-muted">{a.who}</p>
          </li>
        ))}
        <li className="grid place-items-center rounded-[10px] border border-dashed border-brand-line p-3 text-center font-mono text-[11px] text-brand">5 agents · NFT ids</li>
      </ul>
    </DiagramCard>
  );
}

export function ConfirmDiagram() {
  return (
    <DiagramCard label="EIP-712 · Confirmation">
      <pre className="overflow-x-auto rounded-[10px] border border-line bg-bg/70 p-4 font-mono text-[12px] leading-relaxed text-text">
{`Confirmation {
  invoice   INV-001  (0x9c1e…04ab)
  seller    Lumen Data · #12
  amount    4.00 tUSD8
  dueDate   19 Jan 2027
  payee     AutorailRouter 0x5e…a1
}`}
      </pre>
      <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-brand-line bg-brand-soft px-3 py-2">
        <PenLine className="h-4 w-4 text-brand" aria-hidden />
        <span className="text-[13px] text-ink">Signed by Frontier Lab buyer agent #7</span>
        <Check className="ml-auto h-4 w-4 text-brand" aria-hidden />
      </div>
    </DiagramCard>
  );
}

export function FundDiagram() {
  return (
    <DiagramCard label="Vault → JobWallet">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <div className="flex-1 rounded-[10px] border border-line p-3">
          <Landmark className="h-4 w-4 text-brand" aria-hidden />
          <p className="mt-1.5 text-[14px] font-semibold text-ink">ERC-4626 vault</p>
          <p className="font-mono text-[11.5px] text-muted">6.00 tUSD8 · lenders</p>
        </div>
        <div className="flex items-center justify-center gap-1 font-mono text-[11.5px] text-brand">
          <span className="hidden h-px w-6 border-t border-dashed border-brand sm:block" />
          3.00
          <ArrowRight className="h-3.5 w-3.5 rotate-90 sm:rotate-0" aria-hidden />
        </div>
        <div className="flex-1 rounded-[10px] border border-brand bg-brand-soft/60 p-3">
          <Wallet className="h-4 w-4 text-brand" aria-hidden />
          <p className="mt-1.5 text-[14px] font-semibold text-ink">JobWallet · INV-001</p>
          <p className="font-mono text-[11.5px] text-muted">payees 3 · expires 24h</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {["Annotator A", "Annotator B", "GPU merchant", "≤ 1.20 / payment", "≤ 3.00 total"].map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full border border-brand-line bg-surface px-2.5 py-1 font-mono text-[11px] text-brand">
            <KeyRound className="h-3 w-3" aria-hidden /> {t}
          </span>
        ))}
      </div>
    </DiagramCard>
  );
}

export function RepayDiagram() {
  const rows = [
    { k: "Lab signs", v: "EIP-3009 · no gas" },
    { k: "Vault", v: "+3.06 (3.00 + 0.06 fee)" },
    { k: "Vendor", v: "+0.94 + 0.20 swept" },
    { k: "ERC-8004", v: "repaid on time ✓" },
  ];
  return (
    <DiagramCard label="One transaction" caption="Lenders first, then the vendor">
      <ol className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.k} className="flex items-center gap-3 rounded-[10px] border border-line px-3 py-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand font-mono text-[10.5px] text-white">{i + 1}</span>
            <span className="text-[13.5px] font-medium text-ink">{r.k}</span>
            <span className="ml-auto text-right font-mono text-[11.5px] text-brand">{r.v}</span>
          </li>
        ))}
      </ol>
    </DiagramCard>
  );
}
