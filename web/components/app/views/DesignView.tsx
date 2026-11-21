"use client";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import type { ActivityEvent, Agent, JobWallet, Session, TypedDataPayload } from "@/lib/autorail/types";
import { tusd } from "@/lib/autorail/format";
import { ERROR_MESSAGES, type AutorailErrorCode } from "@/lib/autorail/errors";
import { Logo, LogoMark } from "@/components/ui/Logo";
import { GridBackdrop } from "@/components/ui/GridBackdrop";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { StatPill } from "@/components/ui/StatPill";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, StatCard } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { Badge, StateBadge } from "@/components/ui/Badge";
import { AddressChip, TxHashLink } from "@/components/ui/AddressChip";
import { Amount } from "@/components/ui/Amount";
import { TokenInput } from "@/components/ui/TokenInput";
import { TxStatus } from "@/components/ui/TxStatus";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { StepTimeline } from "@/components/ui/StepTimeline";
import { WaterfallBar } from "@/components/ui/WaterfallBar";
import { SpendCapBar } from "@/components/ui/SpendCapBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton, SkeletonRows } from "@/components/ui/Skeleton";
import { DiagramCard } from "@/components/ui/DiagramCard";
import { HubDiagram } from "@/components/diagrams/HubDiagram";
import { NetworkGuard } from "@/components/autorail/NetworkGuard";
import { FaucetHint } from "@/components/autorail/FaucetHint";
import { SessionKeyCard } from "@/components/autorail/SessionKeyCard";
import { GrantSessionModal } from "@/components/autorail/GrantSessionModal";
import { TypedDataReview } from "@/components/autorail/TypedDataReview";
import { AgentCard } from "@/components/autorail/AgentCard";
import { EventLog } from "@/components/autorail/EventLog";
import { DemoRunner } from "@/components/autorail/DemoRunner";
import { useNow } from "@/hooks/useNow";

const TOKENS: [string, string, string][] = [
  ["--bg", "#F8F7F3", "page canvas"],
  ["--bg-alt", "#F1F0EA", "alternating bands"],
  ["--surface", "#FFFFFF", "cards, diagram panels"],
  ["--ink", "#16160F", "headlines"],
  ["--text", "#2B2B26", "body"],
  ["--muted", "#6E6D66", "secondary text"],
  ["--line", "#E4E2DA", "borders, grid lines"],
  ["--brand", "#1F4A3D", "primary, logo, hubs"],
  ["--brand-hover", "#173A30", "button hover"],
  ["--brand-soft", "#E8EEEA", "pills, success chips"],
  ["--brand-line", "#B9CDC3", "pill borders, connectors"],
  ["--danger", "#9B2C2C", "blocked / reverted"],
  ["--danger-soft", "#F7ECEA", "blocked rows"],
  ["--warning", "#8A5F10", "overdue (AA-adjusted)"],
];

const A = (n: number) => `0x${n.toString(16).padStart(2, "0").repeat(20)}` as `0x${string}`;
const H = `0x${"5e".repeat(32)}` as `0x${string}`;
const now0 = Math.floor(Date.now() / 1000);

const wallet: JobWallet = {
  address: A(0x4b), receivableId: "1", owner: A(0x3f), funded: tusd("3"), balance: tusd("0.2"), spent: tusd("2.8"), swept: 0n, closed: false,
  payees: [
    { address: A(0xa1), label: "Annotator A", kind: "annotator" },
    { address: A(0xb2), label: "Annotator B", kind: "annotator" },
    { address: A(0xc3), label: "GPU merchant (x402)", kind: "merchant" },
  ],
  budgetLines: [
    { payee: A(0xa1), label: "Annotator A", budget: tusd("1"), spent: tusd("1") },
    { payee: A(0xb2), label: "Annotator B", budget: tusd("1"), spent: tusd("0.6") },
    { payee: A(0xc3), label: "GPU merchant (x402)", budget: tusd("1"), spent: tusd("0.8") },
  ],
};
const session: Session = { id: "s1", jobWallet: wallet.address, key: A(0x11), label: "Payout agent", payees: wallet.payees.map((p) => p.address), perTxCap: tusd("1.2"), totalCap: tusd("3"), spent: tusd("2.8"), grantedAt: now0, expiresAt: now0 + 23 * 3600, revoked: false, txHash: H };
const agent: Agent = { agentId: 12, name: "Lumen Data (Bengaluru)", role: "seller", address: A(0x3f), owner: A(0x3f), metadataURI: "ipfs://…", status: "online", lastAction: "Created INV-001", lastActionAt: now0 - 120, reputation: [], registeredAt: now0 };
const events: ActivityEvent[] = [
  { id: "1", type: "payment.blocked", title: "Blocked: 0.20 tUSD8 → 0xBAD… (unknown)", detail: "Injected instruction from job notes", status: "blocked", revertReason: "PayeeNotAllowed · This payee isn't on the job's approved list.", txHash: H, block: 1284380, timestamp: now0 },
  { id: "2", type: "payment.sent", title: "Paid 0.80 tUSD8 → GPU merchant (x402)", detail: "x402 · GPU job #4471", status: "ok", txHash: H, block: 1284372, timestamp: now0 - 60 },
  { id: "3", type: "session.revoked", title: "Session revoked: Payout agent", status: "info", txHash: H, block: 1284390, timestamp: now0 - 30 },
];
const typed: TypedDataPayload = { domain: { name: "Autorail ReceivableRegistry", version: "1", chainId: 44005, verifyingContract: A(0x5e) }, types: { Confirmation: [{ name: "amount", type: "uint256" }] }, primaryType: "Confirmation", message: { amount: tusd("4") } };

function Block({ title, children, id }: { title: string; children: React.ReactNode; id: string }) {
  return (
    <section id={id} className="border-t border-line py-12" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="mb-6 font-serif text-[28px] font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function DesignView() {
  const [modal, setModal] = useState(false);
  const [grant, setGrant] = useState(false);
  const [tab, setTab] = useState<"a" | "b" | "c">("a");
  const [amt, setAmt] = useState("1.50");
  const now = useNow();
  return (
    <div className="mx-auto max-w-page px-5 pb-24 sm:px-8">
      <header className="relative overflow-hidden py-16">
        <GridBackdrop />
        <div className="relative">
          <Eyebrow>Design system</Eyebrow>
          <h1 className="h-display mt-4 text-[44px] sm:text-[64px]">Autorail tokens & components</h1>
          <p className="mt-4 max-w-2xl text-[18px] text-muted">Everything the landing page and app are built from. Tokens live in app/globals.css and tailwind.config.ts.</p>
        </div>
      </header>

      <Block title="Colour tokens" id="colours">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {TOKENS.map(([name, hex, use]) => (
            <li key={name} className="card overflow-hidden">
              <div className="h-16 border-b border-line" style={{ background: hex }} />
              <div className="p-3">
                <p className="font-mono text-[12px] text-ink">{name}</p>
                <p className="font-mono text-[11px] text-muted">{hex}</p>
                <p className="mt-1 text-[12px] text-muted">{use}</p>
              </div>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Type" id="type">
        <div className="space-y-5">
          <p className="h-display text-hero-sm lg:text-hero">Libre Baskerville 700</p>
          <p className="h-display text-[44px]">Section heading, 44–52px</p>
          <p className="max-w-2xl text-[18px]">IBM Plex Sans body, 17–19px with relaxed leading. Autorail turns a lab-confirmed invoice into tUSD8 today.</p>
          <p className="eyebrow">IBM Plex Mono eyebrow · 0.25em</p>
          <p className="nav-link">Nav link · 0.18em</p>
          <p className="font-mono text-[14px] text-text">0x456569838f1d43009A91ebA4263147Afd7233483 · 3.06 tUSD8</p>
        </div>
      </Block>

      <Block title="Brand" id="brand">
        <div className="flex flex-wrap items-center gap-8">
          <Logo size={40} />
          <LogoMark size={64} />
          <span className="rounded-card bg-brand p-4"><Logo size={40} inverted /></span>
        </div>
      </Block>

      <Block title="Buttons, pills, badges" id="buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Revoke</Button>
          <Button loading>Loading</Button>
          <Button variant="link">Text link</Button>
          <span className="rounded-btn bg-brand p-2"><Button variant="inverted">Inverted</Button></span>
          <Button size="sm">Small</Button>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <StatPill value="Up to 80%" label="advance on confirmed invoices" />
          <StatPill value="Chain 44005" label="live on Aevum testnet" />
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {(["Created", "Confirmed", "Funded", "Repaid", "Overdue", "Defaulted"] as const).map((s) => <StateBadge key={s} state={s} />)}
          <Badge tone="warning">Mock data</Badge>
          <Badge tone="danger">Should revert</Badge>
        </div>
      </Block>

      <Block title="Data display" id="data">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard label="Vault assets" value={<Amount value={tusd("6.06")} symbol={false} />} sub="tUSD8 · ERC-4626" />
          <Card>
            <CardHeader title="Chips & links" eyebrow="AddressChip · TxHashLink · Amount" />
            <div className="space-y-2">
              <AddressChip address={A(0x3f)} label="Lumen Data" />
              <div><TxHashLink hash={H} /></div>
              <Amount value={tusd("3.06")} sign className="text-[18px] text-brand" />
            </div>
          </Card>
          <Card>
            <CardHeader title="Tabs" eyebrow="Keyboard: arrows / Home / End" />
            <Tabs items={[{ id: "a", label: "Lender" }, { id: "b", label: "Vendor" }, { id: "c", label: "Lab" }]} value={tab} onChange={setTab} />
          </Card>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card><SpendCapBar label="Annotator B" spent={tusd("0.6")} cap={tusd("1")} /><SpendCapBar className="mt-4" label="At cap" spent={tusd("1")} cap={tusd("1")} /></Card>
          <Card>
            <WaterfallBar total={tusd("4")} segments={[{ label: "Vault principal", amount: tusd("3"), tone: "brand" }, { label: "Vault fee", amount: tusd("0.06"), tone: "brand-mid" }, { label: "Vendor remainder", amount: tusd("0.94"), tone: "soft" }]} caption="One EIP-3009 signature. One transaction." />
          </Card>
        </div>
        <Card className="mt-4">
          <StepTimeline steps={[{ label: "Created", sub: "20 Nov", status: "done" }, { label: "Confirmed", sub: "EIP-712", status: "done" }, { label: "Funded", sub: "3.00", status: "current" }, { label: "Repaid", sub: "due 19 Jan", status: "todo" }]} />
        </Card>
      </Block>

      <Block title="Forms & transactions" id="forms">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="space-y-4">
            <TokenInput label="Deposit amount" value={amt} onChange={setAmt} balance={tusd("7")} />
            <FaucetHint balances={{ tUSD8: tusd("0.4"), tQDAY: 0n }} />
            <NetworkGuard />
          </Card>
          <Card className="space-y-3">
            <TxStatus stage="signing" />
            <TxStatus stage="pending" hash={H} />
            <TxStatus stage="confirmed" hash={H} />
            <ErrorBanner error={{ code: "OverPerTxCap", message: ERROR_MESSAGES.OverPerTxCap, txHash: H }} />
          </Card>
        </div>
        <Card className="mt-4">
          <CardHeader title="Plain-English error map" eyebrow="lib/autorail/errors.ts" />
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {(Object.keys(ERROR_MESSAGES) as AutorailErrorCode[]).map((c) => (
              <li key={c} className="rounded-btn border border-line px-3 py-2 text-[13.5px]"><span className="font-mono text-[12px] text-danger">{c}</span> · {ERROR_MESSAGES[c]}</li>
            ))}
          </ul>
        </Card>
      </Block>

      <Block title="Overlays" id="overlays">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setModal(true)}>Open modal</Button>
          <Button variant="secondary" icon={<KeyRound className="h-4 w-4" />} onClick={() => setGrant(true)}>Grant session modal</Button>
        </div>
        <Modal open={modal} onClose={() => setModal(false)} title="Confirm INV-001" description="Accessible dialog: focus trap, Esc closes." footer={<Button onClick={() => setModal(false)}>Close</Button>}>
          <TypedDataReview typedData={typed} summary={<>You confirm you owe <strong>4.00 tUSD8</strong> to Lumen Data by 19 Jan 2027.</>} />
        </Modal>
        <GrantSessionModal open={grant} onClose={() => setGrant(false)} wallet={wallet} defaultKey={A(0x11)} />
      </Block>

      <Block title="Autorail components" id="autorail">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SessionKeyCard session={session} wallet={wallet} now={now} />
          <TypedDataReview typedData={typed} summary={<>You authorise <strong>4.00 tUSD8</strong> to the Autorail router.</>} standard="EIP-3009" />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AgentCard agent={agent} role="seller" now={now} />
          <AgentCard agent={{ ...agent, agentId: 11, name: "Payout agent", role: "payout", status: "blocked", lastAction: "Blocked: PayeeNotAllowed" }} role="payout" now={now} />
          <AgentCard role="merchant" />
          <div className="space-y-3"><Skeleton className="h-8 w-2/3" /><SkeletonRows rows={3} /></div>
        </div>
        <div className="mt-4"><EventLog events={events} /></div>
        <div className="mt-4"><EmptyState title="Empty state" icon={<KeyRound className="h-5 w-5" />}>Helpful next step goes here.</EmptyState></div>
        <div className="mt-4">
          <DiagramCard label="HubDiagram" caption="ok / blocked variants">
            <HubDiagram hub="Payout agent" spokes={[{ label: "Annotator A", sub: "ok", variant: "ok" }, { label: "GPU merchant", sub: "ok", variant: "ok" }, { label: "0xBAD…", sub: "blocked", variant: "blocked" }, { label: "Over cap", sub: "blocked", variant: "blocked" }]} />
          </DiagramCard>
        </div>
        <div className="mt-4"><DemoRunner /></div>
      </Block>
    </div>
  );
}
