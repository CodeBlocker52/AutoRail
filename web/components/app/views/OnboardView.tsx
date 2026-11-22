"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useWalletClient } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, Droplets, FileText, Fuel, Stamp, Wallet } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button, ButtonLink } from "@/components/ui/Button";
import { TxStatus } from "@/components/ui/TxStatus";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Amount } from "@/components/ui/Amount";
import { TxHashLink } from "@/components/ui/AddressChip";
import { useClient, AUTORAIL_KEY } from "@/hooks/useClient";
import { useMode } from "@/hooks/useMode";
import { useBalances } from "@/hooks/useBalances";
import { useTx } from "@/hooks/useTx";
import { decodeError, formatAmount, type DecodedError, type Hash } from "@/lib/autorail";
import { TARGET_CHAIN_ID } from "@/lib/chain/aevum";
import { cn } from "@/lib/cn";

const FAUCET = "https://faucet.qday.info/en";
const GAS_BELOW = 10_000_000_000_000_000n; // 0.01 tQDAY
type Pick = "vendor" | "lab";

const ROLE_COPY: Record<Pick, { title: string; icon: typeof FileText; body: string; need: string; next: string; href: string }> = {
  vendor: {
    title: "Vendor",
    icon: FileText,
    body: "Create invoices to a lab, get an advance in tUSD8, and let a payout agent pay your annotators and GPUs within limits you set.",
    need: "No tUSD8 needed to create an invoice. Gas (tQDAY) only.",
    next: "Create an invoice to Frontier Lab: it auto-confirms invoices up to 0.20 tUSD8 from onboarded vendors.",
    href: "/app/vendor",
  },
  lab: {
    title: "Lab",
    icon: Stamp,
    body: "Confirm invoices addressed to your buyer agent with one EIP-712 signature, then pay them gaslessly with EIP-3009.",
    need: "You need tUSD8 equal to the invoice amount to pay it (e.g. 0.10 tUSD8). Confirming needs gas (tQDAY).",
    next: "Ask a vendor to invoice your agent, then confirm and pay it on the Lab screen.",
    href: "/app/lab",
  },
};

/** Data-URI ERC-8004 registration card (fully onchain, no IPFS). */
function agentCard(name: string, pick: Pick) {
  const card = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name,
    description: pick === "vendor" ? "AI data vendor onboarded through the Autorail app (testnet)." : "AI lab buyer agent onboarded through the Autorail app (testnet).",
    image: "",
    services: [],
    x402Support: false,
    registrations: [],
    autorail: { role: pick === "vendor" ? "seller" : "buyer", onboardedVia: "app", chainId: TARGET_CHAIN_ID },
  };
  const bytes = new TextEncoder().encode(JSON.stringify(card));
  return `data:application/json;base64,${btoa(String.fromCharCode(...bytes))}`;
}

const pendingKey = (address: string, pick: Pick) => `autorail:onboard:${TARGET_CHAIN_ID}:${address.toLowerCase()}:${pick}`;

export function OnboardView() {
  const id = useId();
  const params = useSearchParams();
  const client = useClient();
  const qc = useQueryClient();
  const { mode, setMode } = useMode();
  const { address, isConnected, chainId } = useAccount();
  const { data: wallet } = useWalletClient();
  const { data: bal, refetch: refetchBal } = useBalances(address);
  const [pick, setPick] = useState<Pick>(params.get("role") === "lab" ? "lab" : "vendor");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<{ seller: number | null; buyer: number | null } | null>(null);
  const [registered, setRegistered] = useState<number | null>(null);
  const [error, setError] = useState<DecodedError | null>(null);
  const [dripState, setDripState] = useState<{ busy: boolean; hash?: Hash; note?: string }>({ busy: false });
  const [onboarding, setOnboarding] = useState<{ busy: boolean; txHashes?: Hash[]; done?: boolean }>({ busy: false });
  const reg = useTx("Register ERC-8004 agent");

  const wrongChain = isConnected && chainId !== TARGET_CHAIN_ID;
  const lowGas = bal !== undefined && bal.tQDAY < GAS_BELOW;
  const already = status ? (pick === "vendor" ? status.seller : status.buyer) : null;

  const refreshStatus = useCallback(async () => {
    if (!address || !client.getOnboardingStatus) return;
    setStatus(await client.getOnboardingStatus(address));
  }, [address, client]);

  useEffect(() => {
    setName(pick === "vendor" ? "My data vendor" : "My lab");
  }, [pick]);
  useEffect(() => {
    void refreshStatus();
    if (!address) return;
    // resume: an agent registered earlier but not yet onboarded
    const saved = window.localStorage.getItem(pendingKey(address, pick));
    setRegistered(saved !== null ? Number(saved) : null);
  }, [address, pick, refreshStatus]);

  if (mode !== "onchain") {
    return (
      <Card>
        <CardHeader title="Get started" eyebrow="Onboarding" />
        <p className="text-[14.5px] text-text">Onboarding registers a real ERC-8004 agent from your wallet, so it only works with live data on QDay Aevum.</p>
        <Button className="mt-4" onClick={() => setMode("onchain")}>
          Switch to Live (Aevum)
        </Button>
      </Card>
    );
  }

  const requestDrip = async () => {
    if (!address) return;
    setError(null);
    setDripState({ busy: true });
    try {
      const res = await fetch("/api/drip", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) });
      const body = await res.json();
      if (!res.ok) throw body;
      setDripState({ busy: false, hash: body.hash, note: body.dripped ? `Sent ${body.amount} tQDAY for gas.` : "This wallet already has enough tQDAY." });
      await refetchBal();
    } catch (e) {
      setDripState({ busy: false });
      setError(decodeError(e));
    }
  };

  const register = async () => {
    if (!address) return;
    setError(null);
    const out = await reg.run((o) => client.registerAgent({ name: name.trim(), role: pick === "vendor" ? "seller" : "buyer", metadataURI: agentCard(name.trim(), pick) }, o));
    if (out) {
      window.localStorage.setItem(pendingKey(address, pick), String(out.agentId));
      setRegistered(out.agentId);
    }
  };

  const assignRole = async () => {
    if (!address || registered === null || !wallet) return;
    setError(null);
    setOnboarding({ busy: true });
    try {
      const issuedAt = new Date().toISOString();
      const q = new URLSearchParams({ address, agentId: String(registered), role: pick, issuedAt });
      const msgRes = await fetch(`/api/onboard?${q}`);
      const { message } = (await msgRes.json()) as { message: string };
      const signature = await wallet.signMessage({ account: address, message });
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, agentId: String(registered), role: pick, issuedAt, signature }),
      });
      const body = await res.json();
      if (!res.ok) throw body;
      window.localStorage.removeItem(pendingKey(address, pick));
      setOnboarding({ busy: false, txHashes: body.txHashes, done: true });
      await refreshStatus();
      void qc.invalidateQueries({ queryKey: [AUTORAIL_KEY] });
    } catch (e) {
      setOnboarding({ busy: false });
      setError(decodeError(e));
    }
  };

  const copy = ROLE_COPY[pick];
  const step = !isConnected || wrongChain ? 1 : already !== null || onboarding.done ? 4 : registered !== null ? 3 : 2;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardHeader title="Get started with your own wallet" eyebrow="Self-serve onboarding · testnet" />
        <p className="text-[14.5px] text-text">
          Register an ERC-8004 agent from your wallet and Autorail gives it a role. Three steps, about a minute. Testnet only: tUSD8 and tQDAY have no value.
        </p>
        <ol className="mt-4 grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-4">
          {["Connect", "Register agent", "Get your role", "Start"].map((t, i) => (
            <li key={t} className={cn("flex items-center gap-2 rounded-btn border px-3 py-2", step > i + 1 ? "border-brand-line bg-brand-soft/50 text-brand" : step === i + 1 ? "border-brand text-ink" : "border-line text-muted")}>
              <span className="font-mono text-[11px]">{String(i + 1).padStart(2, "0")}</span> {t}
            </li>
          ))}
        </ol>
      </Card>

      {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

      {/* 1 · wallet + gas */}
      <Card>
        <CardHeader title="1 · Connect a wallet" eyebrow={<Wallet className="h-4 w-4" aria-hidden />} />
        {!isConnected ? (
          <ConnectButton label="Connect wallet" />
        ) : wrongChain ? (
          <p className="text-[14px] text-warning">Switch your wallet to QDay Aevum testnet ({TARGET_CHAIN_ID}). Use the banner at the top of the page.</p>
        ) : (
          <div className="space-y-3">
            <dl className="grid grid-cols-2 gap-3 text-[14px]">
              <div className="rounded-btn border border-line p-3">
                <dt className="text-muted">tQDAY (gas)</dt>
                <dd className="font-mono text-ink"><Amount value={bal?.tQDAY} decimals={18} maxFrac={4} symbol={false} /></dd>
              </div>
              <div className="rounded-btn border border-line p-3">
                <dt className="text-muted">tUSD8</dt>
                <dd className="font-mono text-ink"><Amount value={bal?.tUSD8} symbol={false} /></dd>
              </div>
            </dl>
            {lowGas && (
              <div className="flex flex-col gap-2 rounded-btn border border-warning/40 bg-[#FBF3E2] p-3 text-[13.5px] text-warning sm:flex-row sm:items-center">
                <Fuel className="h-4 w-4 shrink-0" aria-hidden />
                <p className="flex-1">You need a little tQDAY for gas (about 0.001 per transaction). We can send 0.02 tQDAY once to this wallet.</p>
                <Button size="sm" onClick={requestDrip} loading={dripState.busy}>
                  Get 0.02 tQDAY
                </Button>
              </div>
            )}
            {dripState.note && (
              <p className="text-[13px] text-brand">
                {dripState.note} {dripState.hash && <TxHashLink hash={dripState.hash} />}
              </p>
            )}
            <p className="text-[13px] text-muted">
              <Droplets className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              tUSD8 comes from the official faucet (no tUSD8 drip here):{" "}
              <a href={FAUCET} target="_blank" rel="noreferrer" className="font-medium text-brand underline-offset-2 hover:underline">
                faucet.qday.info
              </a>
              . {copy.need}
            </p>
          </div>
        )}
      </Card>

      {/* 2 · role + register */}
      <Card className={cn(step < 2 && "opacity-60")}>
        <CardHeader title="2 · Choose a role and register your agent" eyebrow="ERC-8004 identity" />
        <div role="radiogroup" aria-label="Role" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(["vendor", "lab"] as const).map((p) => {
            const C = ROLE_COPY[p];
            const has = status ? (p === "vendor" ? status.seller : status.buyer) : null;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={pick === p}
                onClick={() => setPick(p)}
                className={cn("rounded-card border p-4 text-left transition-colors", pick === p ? "border-brand bg-brand-soft/40" : "border-line hover:border-brand-line")}
              >
                <span className="flex items-center gap-2 font-semibold text-ink">
                  <C.icon className="h-4 w-4 text-brand" aria-hidden /> {C.title}
                  {has !== null && <span className="ml-auto font-mono text-[11px] text-brand">agent #{has} ✓</span>}
                </span>
                <span className="mt-1 block text-[13px] text-muted">{C.body}</span>
              </button>
            );
          })}
        </div>
        {already !== null ? (
          <p className="mt-4 flex items-center gap-2 text-[14px] text-brand">
            <BadgeCheck className="h-4 w-4" aria-hidden /> This wallet is already a {copy.title.toLowerCase()}: agent #{already}.
          </p>
        ) : registered !== null ? (
          <p className="mt-4 text-[14px] text-brand">Agent #{registered} registered. Next: get your role.</p>
        ) : (
          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor={`${id}-name`} className="label">Agent name</label>
              <input id={`${id}-name`} className="field" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
              <p className="mt-1 text-[12px] text-muted">Stored fully onchain as a data-URI registration card. You own the agent NFT.</p>
            </div>
            <Button onClick={register} loading={reg.isBusy} disabled={step < 2 || !name.trim() || lowGas}>
              Register agent
            </Button>
            <TxStatus stage={reg.stage} hash={reg.hash} error={reg.error} onDismiss={reg.reset} labels={{ confirmed: "Agent NFT minted" }} />
          </div>
        )}
      </Card>

      {/* 3 · role */}
      <Card className={cn(step < 3 && "opacity-60")}>
        <CardHeader title={`3 · Get the ${pick === "vendor" ? "Seller" : "Buyer"} role`} eyebrow="AutorailRoles" />
        <p className="text-[14px] text-text">
          Sign one message (no gas) proving you own {registered !== null ? `agent #${registered}` : "your new agent"}. Autorail&apos;s roles operator then assigns{" "}
          {pick === "vendor" ? "the Seller role" : "the Buyer role with credit tier 1"}. It can only ever assign Seller or Buyer.
        </p>
        {onboarding.done || already !== null ? (
          <div className="mt-3 space-y-1 text-[14px] text-brand">
            <p className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4" aria-hidden /> Role assigned.
            </p>
            {onboarding.txHashes?.map((h) => <TxHashLink key={h} hash={h} />)}
          </div>
        ) : (
          <Button className="mt-4" onClick={assignRole} loading={onboarding.busy} disabled={step !== 3}>
            Sign and get my role
          </Button>
        )}
      </Card>

      {/* 4 · next */}
      {step === 4 && (
        <Card>
          <CardHeader title="4 · You're in" eyebrow="Next" />
          <p className="text-[14px] text-text">{copy.next}</p>
          {pick === "lab" && bal && bal.tUSD8 < 100_000n && (
            <p className="mt-2 text-[13px] text-warning">
              You have {formatAmount(bal.tUSD8)} tUSD8. You&apos;ll need the invoice amount (e.g. 0.10 tUSD8) to pay:{" "}
              <a href={FAUCET} target="_blank" rel="noreferrer" className="underline">get tUSD8</a>.
            </p>
          )}
          <ButtonLink href={copy.href} className="mt-4" icon={<ArrowRight className="h-4 w-4" />}>
            Go to the {copy.title} screen
          </ButtonLink>
        </Card>
      )}
      <p className="text-center text-[12.5px] text-muted">
        Want to look around first? <Link href="/app/agents" className="text-brand underline-offset-2 hover:underline">Replay the recorded run</Link>.
      </p>
    </div>
  );
}
