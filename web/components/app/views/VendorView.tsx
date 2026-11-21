"use client";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { keccak256, stringToHex, toHex } from "viem";
import { BadgeCheck, Upload } from "lucide-react";
import type { Address, AgentRole, Hash } from "@/lib/autorail/types";
import { formatDate, parseTokenInput, shortHash } from "@/lib/autorail/format";
import { useActor, useAgents, useClient, useReceivables, useTx } from "@/hooks";
import { AddressChip, TxHashLink } from "@/components/ui/AddressChip";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { TokenInput } from "@/components/ui/TokenInput";
import { TxStatus } from "@/components/ui/TxStatus";
import { InvoicesTable } from "@/components/autorail/InvoicesTable";
import { AdvanceOfferCard } from "@/components/autorail/AdvanceOfferCard";

const isAddr = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v);
const dateInput = (d: Date) => d.toISOString().slice(0, 10);

function RegisterAgentCard() {
  const id = useId();
  const client = useClient();
  const vendor = useActor("vendor");
  const { data: agents, isLoading } = useAgents();
  const tx = useTx("Register agent");
  const [name, setName] = useState("Lumen Data (Bengaluru)");
  const [role, setRole] = useState<AgentRole>("seller");
  const [uri, setUri] = useState("ipfs://bafy…lumen/agent.json");
  const mine = agents?.find((a) => a.role === "seller" && a.owner.toLowerCase() === vendor?.toLowerCase());

  return (
    <Card>
      <CardHeader title="Your agent" eyebrow="ERC-8004 identity" />
      {isLoading ? (
        <SkeletonRows rows={3} />
      ) : mine ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-[10px] border border-brand-line bg-brand-soft/50 p-4">
            <span className="grid h-11 w-11 place-items-center rounded-[10px] bg-brand font-mono text-[14px] text-white">#{mine.agentId}</span>
            <div className="min-w-0">
              <p className="font-semibold text-ink">{mine.name}</p>
              <p className="font-mono text-[12px] text-muted">Agent NFT #{mine.agentId} · seller</p>
            </div>
            <BadgeCheck className="ml-auto h-5 w-5 text-brand" aria-label="Registered" />
          </div>
          <dl className="space-y-2 text-[13.5px]">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">Address</dt>
              <dd><AddressChip address={mine.address} /></dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">Metadata</dt>
              <dd className="truncate font-mono text-[12px] text-text">{mine.metadataURI}</dd>
            </div>
            {mine.txHash && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">Registered</dt>
                <dd><TxHashLink hash={mine.txHash} /></dd>
              </div>
            )}
          </dl>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            tx.run((o) => client.registerAgent({ name, role, metadataURI: uri }, o));
          }}
        >
          <div>
            <label htmlFor={`${id}-n`} className="label">Name</label>
            <input id={`${id}-n`} className="field" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-r`} className="label">Role</label>
              <select id={`${id}-r`} className="field" value={role} onChange={(e) => setRole(e.target.value as AgentRole)}>
                <option value="seller">Seller (vendor)</option>
                <option value="payout">Payout agent</option>
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-u`} className="label">Metadata URI</label>
              <input id={`${id}-u`} className="field font-mono !text-[13px]" value={uri} onChange={(e) => setUri(e.target.value)} />
            </div>
          </div>
          <Button type="submit" loading={tx.isBusy} disabled={!name.trim()}>
            Register agent
          </Button>
          <TxStatus stage={tx.stage} hash={tx.hash} error={tx.error} onDismiss={tx.reset} labels={{ confirmed: "Agent NFT minted" }} />
        </form>
      )}
    </Card>
  );
}

function CreateInvoiceCard({ nextNumber }: { nextNumber: string }) {
  const id = useId();
  const client = useClient();
  const { data: agents } = useAgents();
  const buyers = useMemo(() => agents?.filter((a) => a.role === "buyer") ?? [], [agents]);
  const tx = useTx("Create invoice");
  const [num, setNum] = useState(nextNumber);
  const [buyerSel, setBuyerSel] = useState<string>("");
  const [custom, setCustom] = useState("");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState(() => dateInput(new Date(Date.now() + 60 * 86400_000)));
  const [fileHash, setFileHash] = useState<{ name: string; hash: Hash } | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => setNum(nextNumber), [nextNumber]);
  useEffect(() => {
    if (!buyerSel && buyers[0]) setBuyerSel(buyers[0].address);
  }, [buyers, buyerSel]);

  const buyer = buyerSel === "custom" ? custom : buyerSel;
  const amountV = parseTokenInput(amount);
  const dueTs = Math.floor(new Date(due + "T12:00:00").getTime() / 1000);
  const fallbackHash = useMemo(() => keccak256(stringToHex(`${num}|${buyer}|${amount}|${due}`)), [num, buyer, amount, due]);
  const hash = fileHash?.hash ?? fallbackHash;
  const valid = !!num.trim() && isAddr(buyer) && !!amountV && dueTs > Date.now() / 1000;

  return (
    <Card>
      <CardHeader title="Create invoice" eyebrow="Receivable registry" />
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setCreatedId(null);
          const r = await tx.run((o) => client.createReceivable({ invoiceNumber: num, buyer: buyer as Address, amount: amountV!, dueDate: dueTs, invoiceHash: hash }, o));
          if (r) {
            setCreatedId(r.receivableId);
            setAmount("");
            setFileHash(null);
          }
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-num`} className="label">Invoice number</label>
            <input id={`${id}-num`} className="field font-mono" value={num} onChange={(e) => setNum(e.target.value)} required />
          </div>
          <div>
            <label htmlFor={`${id}-due`} className="label">Due date</label>
            <input id={`${id}-due`} type="date" className="field" value={due} min={dateInput(new Date(Date.now() + 86400_000))} onChange={(e) => setDue(e.target.value)} required />
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-buyer`} className="label">Buyer agent</label>
          <select id={`${id}-buyer`} className="field" value={buyerSel} onChange={(e) => setBuyerSel(e.target.value)}>
            {buyers.map((b) => (
              <option key={b.agentId} value={b.address}>
                #{b.agentId} · {b.name}
              </option>
            ))}
            <option value="custom">Other address…</option>
          </select>
          {buyerSel === "custom" && (
            <input aria-label="Buyer address" className="field mt-2 font-mono !text-[13px]" placeholder="0x…" value={custom} onChange={(e) => setCustom(e.target.value.trim())} spellCheck={false} />
          )}
        </div>
        <TokenInput label="Amount" value={amount} onChange={setAmount} hint="Demo amounts are tiny: tUSD8 is scarce on testnet." />
        <div>
          <span className="label">Invoice file</span>
          <label className="flex cursor-pointer items-center gap-3 rounded-btn border border-dashed border-line bg-bg px-3 py-3 text-[13.5px] hover:border-brand-line focus-within:ring-2 focus-within:ring-brand/30">
            <Upload className="h-4 w-4 text-brand" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{fileHash ? fileHash.name : "Choose a PDF. It is hashed in your browser and never uploaded."}</span>
            <input
              type="file"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return setFileHash(null);
                const bytes = new Uint8Array(await f.arrayBuffer());
                setFileHash({ name: f.name, hash: keccak256(toHex(bytes)) });
              }}
            />
          </label>
          <p className="mt-1.5 font-mono text-[11.5px] text-muted">
            keccak256 {shortHash(hash)} {fileHash ? "· from file" : "· from invoice details (no file chosen)"}
          </p>
        </div>
        <Button type="submit" disabled={!valid} loading={tx.isBusy}>
          Create invoice
        </Button>
        <TxStatus stage={tx.stage} hash={tx.hash} error={tx.error} onDismiss={tx.reset} />
        {createdId && (
          <p className="text-[13.5px] text-brand">
            Created. <Link href={`/app/invoices/${createdId}`} className="font-medium underline">Open invoice {createdId.length > 12 ? `${createdId.slice(0, 10)}…` : `#${createdId}`}</Link>, then ask the lab to confirm it.
          </p>
        )}
      </form>
    </Card>
  );
}

export function VendorView() {
  const vendor = useActor("vendor");
  const receivables = useReceivables();
  const mine = receivables.data?.filter((r) => r.seller.toLowerCase() === vendor?.toLowerCase()) ?? [];
  const nextNumber = `INV-${String(mine.length + 1).padStart(3, "0")}`;
  const offerFor = mine.find((r) => r.state === "Confirmed") ?? mine.find((r) => r.state === "Funded");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-6">
          <RegisterAgentCard />
          {offerFor ? (
            <AdvanceOfferCard receivable={offerFor} />
          ) : (
            <Card>
              <CardHeader title="Advance offer" eyebrow="Underwriting agent" />
              <EmptyState title="No offer yet">Offers appear once the lab confirms an invoice.</EmptyState>
            </Card>
          )}
        </div>
        <CreateInvoiceCard nextNumber={nextNumber} />
      </div>
      <Card>
        <CardHeader title="Your invoices" eyebrow="Created · Confirmed · Funded · Repaid · Overdue · Defaulted" />
        {receivables.isLoading ? <SkeletonRows /> : mine.length ? <InvoicesTable items={mine} /> : <EmptyState title="No invoices yet">Create your first invoice above.</EmptyState>}
        {mine.some((r) => r.state === "Funded") && (
          <p className="mt-4 text-[13px] text-muted">Next repayment due {formatDate(Math.min(...mine.filter((r) => r.state === "Funded").map((r) => r.dueDate)))}.</p>
        )}
      </Card>
    </div>
  );
}
