/**
 * Onchain AutorailClient: viem reads against the Aevum deployment (or the local fork), an incremental event
 * indexer (≤1,000-block chunks, Blockscout backfill), and wallet writes through the connected wagmi wallet.
 * Server-only actions (underwriting signature, gasless relay, live demo) go through /api routes.
 */
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  decodeEventLog,
  decodeFunctionData,
  getAddress,
  http,
  parseSignature,
  zeroAddress,
  type Abi,
  type Hash,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import type { AutorailClient } from "./client";
import { formatAmount } from "./format";
import { AutorailError, decodeRevertData, ERROR_MESSAGES, type AutorailErrorCode } from "./errors";
import { blockscoutLogs, blockscoutTxs } from "./blockscout";
import { LogIndexer } from "./indexer";
import { parseAgentURI, roleName, sellerLimit, stateName, toActivity, toAgentId, type ActivityContext, type DecodedLog } from "./mapping";
import { buildQuote } from "./underwriting";
import { CONFIRMATION_TYPES, PERMIT_TYPES, RECEIVE_TYPES, tusd8Domain } from "./tokenDomain";
import * as abis from "./generated/abis";
import {
  autorailRolesAbi,
  autorailVaultAbi,
  creditFacilityAbi,
  identityRegistryAbi,
  jobWalletAbi,
  jobWalletFactoryAbi,
  receivableRegistryAbi,
  repaymentRouterAbi,
} from "./generated/abis";
import { DEPLOYMENTS, type Deployment } from "./generated/deployments";
import { ADDRESS_LABELS, DEMO_ADDRESSES } from "./generated/labels";
import { RECORDED_RUN, RECORDED_RUN_ORDER } from "./generated/recordedRun";
import { DEMO_CONFIG } from "./generated/demoConfig";
import { isLiveAevum, POLL_INTERVAL_MS, TARGET_CHAIN_ID, targetChain } from "../chain/aevum";
import type {
  ActivityEvent,
  ActivityFilter,
  Address,
  AdvanceOffer,
  Agent,
  Amount,
  Balances,
  CreateReceivableInput,
  DemoMode,
  DemoPreset,
  DemoStep,
  GrantSessionInput,
  JobWallet,
  LenderPosition,
  LivePreflight,
  PayInput,
  Payment,
  Payee,
  Receivable,
  ReceivableId,
  RegisterAgentInput,
  Repayment,
  ReputationEntry,
  RiskBand,
  Role,
  Session,
  TypedDataPayload,
  VaultPoint,
  VaultStats,
  WriteOptions,
  WriteResult,
} from "./types";

const ERC20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const ALL_ERRORS = Object.values(abis)
  .flat()
  .filter((x) => (x as { type: string }).type === "error") as unknown as Abi;

const lc = (a: string) => a.toLowerCase();
const fmt6 = (v: bigint) => formatAmount(v);
/** Vault shares have 12 decimals (_decimalsOffset() = 6 on top of tUSD8's 6). The UI shows them on the 6-decimal scale. */
const SHARE_SCALE = 1_000_000n;
/** Minimum tQDAY a wallet needs before we ask it to sign a gas-paying transaction. */
const MIN_GAS = 1_000_000_000_000_000n; // 0.001 tQDAY
const nowSec = () => BigInt(Math.floor(Date.now() / 1000));
const bandOfFee = (feeBps: number): RiskBand => (feeBps <= 150 ? "A" : feeBps <= 200 ? "B" : feeBps <= 300 ? "C" : "D");

interface RawReceivable {
  invoiceHash: Hex;
  seller: Address;
  buyer: Address;
  sellerAgentId: bigint;
  buyerAgentId: bigint;
  amount: bigint;
  dueDate: bigint;
  createdAt: bigint;
  confirmedAt: bigint;
  state: number;
}

interface LiveRunState {
  runId: string;
  receivableId: Hex;
  jobWallet?: Address;
  steps: Record<string, { key: string; status: "done" | "reverted-as-expected" | "failed"; txHashes: Hash[]; decodedError?: string; note?: string }>;
}

/** Recorded-run step metadata (actor + what the proof is). Order comes from RECORDED_RUN_ORDER, never from object keys. */
const STEP_META: Record<string, { actor: Role; proof: string; expect?: AutorailErrorCode; description: string }> = {
  "1": { actor: "lender", proof: "Deposit tx · vault shares", description: "The lender signs one EIP-2612 permit; the vault pulls tUSD8 and mints shares." },
  "2": { actor: "agents", proof: "ERC-8004 ownerOf / tokenURI", description: "Five ERC-8004 identities: seller #0, buyer #1, underwriter #2, payout #3, GPU merchant #4." },
  "3": { actor: "vendor", proof: "ReceivableCreated", description: "The seller agent registers the invoice hash and amount." },
  "4": { actor: "lab", proof: "ReceivableConfirmed (EIP-712)", description: "The buyer signs a confirmation that pins the payee to the Autorail router." },
  "5": { actor: "agents", proof: "Funded · JobWalletCreated", description: "The underwriting agent signs an Offer inside the pricing rules; the seller accepts it and the advance lands in a fresh JobWallet." },
  "6": { actor: "vendor", proof: "SessionGranted", description: "The seller grants the payout agent a session key: approved payees, per-payment cap, total cap, 24h expiry." },
  "7a": { actor: "agents", proof: "Paid", description: "The payout agent pays Annotator A." },
  "7b": { actor: "agents", proof: "Paid", description: "The payout agent pays Annotator B." },
  "7c": { actor: "agents", proof: "Paid (memo = x402 requestId)", description: "The merchant answers HTTP 402; the agent pays from the JobWallet and gets HTTP 200." },
  "8": { actor: "agents", proof: "Mined revert: PayeeNotAllowed", expect: "PayeeNotAllowed", description: "A prompt-injection line in the job notes asks the agent to pay 0xBAD…. The JobWallet refuses it." },
  "9": { actor: "agents", proof: "Mined revert: OverPerTxCap", expect: "OverPerTxCap", description: "The agent tries to pay more than the per-payment cap." },
  "10a": { actor: "vendor", proof: "SessionKeyRevoked", description: "The seller revokes the session key." },
  "10b": { actor: "agents", proof: "Mined revert: SessionRevoked", expect: "SessionRevoked", description: "The agent retries after the revoke and is refused." },
  "11": { actor: "lab", proof: "Repaid · NewFeedback in the same tx", description: "The buyer signs an EIP-3009 authorization (no gas); the relayer submits it; lenders are repaid first." },
  "12": { actor: "agents", proof: "getSummary(seller, [router])", description: "The seller's ERC-8004 reputation now shows the on-time repayment." },
};

const L = DEMO_CONFIG.live;
const t6 = (v: number) => formatAmount(BigInt(v));
/** Live-run titles (amounts from the tiny `live` profile, not the recorded run). */
const LIVE_TITLES: Record<string, string> = {
  "1": `Lender deposits ${t6(L.lenderDeposit)} tUSD8 into the vault (EIP-2612 permit)`,
  "3": `Seller agent creates a ${t6(L.invoiceAmount)} tUSD8 invoice`,
  "7a": `Payout agent pays Annotator A ${t6(L.payA)}`,
  "7b": `Payout agent pays Annotator B ${t6(L.payB)}`,
  "7c": `Payout agent pays the GPU merchant ${t6(L.payGpu)} (x402-style)`,
  "8": `Prompt-injection attempt: pay 0xBAD… ${t6(L.blockedRogue)}`,
  "9": `Over-cap attempt: ${t6(L.blockedOverCap)} to the GPU merchant (cap ${t6(L.perTxCap)})`,
  "10b": `Payout agent retries ${t6(L.blockedAfterRevoke)} after revoke`,
};

export class OnchainAutorailClient implements AutorailClient {
  readonly mode = "onchain" as const;
  readonly deployment: Deployment;
  private pc: PublicClient;
  private wallet?: WalletClient;
  private indexer: LogIndexer;
  private listeners = new Set<() => void>();
  private c: Record<"vault" | "registry" | "facility" | "factory" | "router" | "roles" | "identity" | "reputation", Address>;
  private memo = new Map<string, { at: bigint | number; value: unknown }>();
  private blockedCache = new Map<string, Payment | null>();
  private demoMode: DemoMode = "recorded";
  private live?: LiveRunState;

  constructor(rpcUrl?: string) {
    const d = (DEPLOYMENTS as unknown as Record<number, Deployment>)[TARGET_CHAIN_ID];
    if (!d) throw new AutorailError("WrongChain", `No Autorail deployment for chain ${TARGET_CHAIN_ID}.`);
    this.deployment = d;
    this.c = d.contracts as unknown as OnchainAutorailClient["c"];
    this.pc = createPublicClient({
      chain: targetChain,
      transport: http(rpcUrl ?? targetChain.rpcUrls.default.http[0]),
      pollingInterval: POLL_INTERVAL_MS,
    }) as PublicClient;
    this.indexer = new LogIndexer(this.pc, {
      deployBlock: BigInt(d.deployBlock),
      core: [this.c.vault, this.c.registry, this.c.facility, this.c.factory, this.c.router, this.c.identity, this.c.reputation],
      factory: this.c.factory,
      history: isLiveAevum ? blockscoutLogs : undefined,
    });
  }

  // ─────────────────────────── infra ───────────────────────────

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
  private emit() {
    this.memo.clear();
    this.listeners.forEach((l) => l());
  }
  setWalletClient(wallet: WalletClient | undefined) {
    this.wallet = wallet;
  }
  resolveActor(_role: Role, connected?: Address) {
    return connected;
  }

  /** Cache a computed value until the indexer cursor moves (or for `ttlMs` when keyed by time). */
  private async cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    await this.indexer.fresh(POLL_INTERVAL_MS);
    const hit = this.memo.get(key);
    if (hit && hit.at === this.indexer.cursor) return hit.value as T;
    const value = await fn();
    this.memo.set(key, { at: this.indexer.cursor, value });
    return value;
  }

  private read<T>(address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []): Promise<T> {
    return this.pc.readContract({ address, abi, functionName, args } as never) as Promise<T>;
  }

  private label = (addr: string): string => {
    const a = lc(addr);
    if (ADDRESS_LABELS[a]) return ADDRESS_LABELS[a];
    const named: Record<string, string> = {
      [lc(this.c.vault)]: "Autorail vault",
      [lc(this.c.router)]: "Autorail router",
      [lc(this.c.facility)]: "Credit facility",
      [lc(this.c.registry)]: "Receivable registry",
    };
    if (named[a]) return named[a];
    if (this.indexer.wallets.has(a)) return `JobWallet ${addr.slice(0, 8)}…`;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  };

  // ─────────────────────────── basic reads ───────────────────────────

  async getBalances(account: Address): Promise<Balances> {
    const [tUSD8, tQDAY] = await Promise.all([
      this.read<bigint>(this.deployment.tUSD8, ERC20 as unknown as Abi, "balanceOf", [account]),
      this.pc.getBalance({ address: account }),
    ]);
    return { tUSD8, tQDAY };
  }

  async getVaultStats(): Promise<VaultStats> {
    return this.cached("vault", async () => {
      const v = this.c.vault;
      const [totalAssets, idle, outstanding, totalShares, feesEarned, defaults] = await Promise.all([
        this.read<bigint>(v, autorailVaultAbi, "totalAssets"),
        this.read<bigint>(v, autorailVaultAbi, "idle"),
        this.read<bigint>(v, autorailVaultAbi, "outstandingPrincipal"),
        this.read<bigint>(v, autorailVaultAbi, "totalSupply"),
        this.read<bigint>(v, autorailVaultAbi, "totalFeesEarned"),
        this.read<bigint>(v, autorailVaultAbi, "totalWrittenOff"),
      ]);
      const vlogs = this.indexer.logs.filter((l) => l.address === lc(v));
      let repaidPrincipal = 0n;
      let lentTotal = 0n;
      // replay vault events into a history series
      let assets = 0n;
      let out = 0n;
      const points: { block: number; assets: bigint; out: bigint }[] = [];
      for (const l of vlogs) {
        const a = l.args as Record<string, bigint>;
        if (l.eventName === "Deposit") assets += a.assets;
        else if (l.eventName === "Withdraw") assets -= a.assets;
        else if (l.eventName === "Lent") {
          out += a.amount;
          lentTotal += a.amount;
        }
        else if (l.eventName === "Repaid") {
          out -= a.principal;
          assets += a.fee;
          repaidPrincipal += a.principal;
        }
        else if (l.eventName === "WrittenOff") {
          out -= a.principal;
          assets -= a.principal;
        }
        else continue;
        points.push({ block: l.blockNumber, assets, out });
      }
      const ts = await this.indexer.timestamps(points.map((p) => p.block));
      const history: VaultPoint[] = points.map((p) => ({
        timestamp: ts(p.block),
        totalAssets: p.assets,
        utilizationBps: p.assets > 0n ? Number((p.out * 10_000n) / p.assets) : 0,
      }));
      history.push({ timestamp: Math.floor(Date.now() / 1000), totalAssets, utilizationBps: totalAssets > 0n ? Number((outstanding * 10_000n) / totalAssets) : 0 });
      const funded = this.indexer.byName("Funded").length;
      const closed = this.indexer.byName("RepaymentRecorded").length + this.indexer.byName("Defaulted").length;
      // realised yield: fees / principal lent, annualised over the demo term (60 days)
      const estApyBps = lentTotal > 0n ? Number((feesEarned * 10_000n * 365n) / (lentTotal * 60n)) : 0;
      return {
        totalAssets,
        idle,
        outstanding,
        totalShares: totalShares / SHARE_SCALE,
        repaidPrincipal,
        feesEarned,
        defaults,
        utilizationBps: totalAssets > 0n ? Number((outstanding * 10_000n) / totalAssets) : 0,
        estApyBps,
        activeAdvances: Math.max(0, funded - closed),
        history,
      };
    });
  }

  async getLenderPosition(account: Address): Promise<LenderPosition> {
    const v = this.c.vault;
    await this.indexer.fresh(POLL_INTERVAL_MS);
    const [shares, maxW, idle] = await Promise.all([
      this.read<bigint>(v, autorailVaultAbi, "balanceOf", [account]),
      this.read<bigint>(v, autorailVaultAbi, "maxWithdraw", [account]),
      this.read<bigint>(v, autorailVaultAbi, "idle"),
    ]);
    const value = shares > 0n ? await this.read<bigint>(v, autorailVaultAbi, "convertToAssets", [shares]) : 0n;
    let deposited = 0n;
    for (const l of this.indexer.logs) {
      if (l.address !== lc(v)) continue;
      const a = l.args as { owner?: string; assets?: bigint };
      if (l.eventName === "Deposit" && lc(String(a.owner)) === lc(account)) deposited += a.assets!;
      if (l.eventName === "Withdraw" && lc(String(a.owner)) === lc(account)) deposited -= a.assets!;
    }
    if (deposited < 0n) deposited = 0n;
    const earned = value > deposited ? value - deposited : 0n;
    return { shares: shares / SHARE_SCALE, value, deposited, earned, maxWithdraw: maxW < idle ? maxW : idle };
  }

  // ─────────────────────────── agents ───────────────────────────

  async getAgents(): Promise<Agent[]> {
    return this.cached("agents", async () => {
      const regs = this.indexer.byName("Registered").filter((l) => l.address === lc(this.c.identity));
      const blocks = regs.map((l) => l.blockNumber);
      const feedback = this.indexer.byName("NewFeedback").filter((l) => l.address === lc(this.c.reputation));
      const ts = await this.indexer.timestamps([...blocks, ...feedback.map((f) => f.blockNumber)]);
      const out: Agent[] = [];
      for (const r of regs) {
        const id = toAgentId(r.args.agentId as bigint)!;
        const [roleIdx, owner, uri] = await Promise.all([
          this.read<number>(this.c.roles, autorailRolesAbi, "roleOf", [BigInt(id)]),
          this.read<Address>(this.c.identity, identityRegistryAbi, "ownerOf", [BigInt(id)]),
          this.read<string>(this.c.identity, identityRegistryAbi, "tokenURI", [BigInt(id)]).catch(() => String(r.args.agentURI ?? "")),
        ]);
        const role = roleName(roleIdx);
        if (!role) continue; // registered without an Autorail role (e.g. the smoke-test agent)
        const file = parseAgentURI(uri);
        let onTime = 0;
        let defaults = 0;
        const reputation: ReputationEntry[] = [
          { timestamp: ts(r.blockNumber), score: 50, tag: "registered", note: "ERC-8004 identity registered", advanceLimit: role === "seller" ? sellerLimit(0, 0) : 0n, txHash: r.transactionHash },
        ];
        for (const f of feedback) {
          if (toAgentId(f.args.agentId as bigint) !== id) continue;
          const tag2 = String(f.args.tag2 ?? "");
          const tag: ReputationEntry["tag"] = tag2 === "repaid_on_time" ? "repaid_on_time" : tag2 === "repaid_late" ? "repaid_late" : "defaulted";
          if (tag === "repaid_on_time") onTime++;
          if (tag === "defaulted") defaults++;
          reputation.push({
            timestamp: ts(f.blockNumber),
            score: Number(f.args.value as bigint),
            tag,
            note: `ERC-8004 feedback ${String(f.args.value)} (${String(f.args.tag1)}/${tag2}) from ${this.label(String(f.args.clientAddress))}`,
            advanceLimit: sellerLimit(onTime, defaults),
            txHash: f.transactionHash,
          });
        }
        const address = role === "payout" ? (getAddress(DEMO_ADDRESSES.PAYOUT_SESSION) as Address) : owner;
        const last = reputation[reputation.length - 1];
        out.push({
          agentId: id,
          name: file?.name ?? this.label(owner),
          role,
          address,
          owner,
          metadataURI: uri,
          status: "online",
          lastAction: last.tag === "registered" ? "Registered" : last.note,
          lastActionAt: last.timestamp,
          reputation,
          registeredAt: ts(r.blockNumber),
          txHash: r.transactionHash,
        });
      }
      return out.sort((a, b) => a.agentId - b.agentId);
    });
  }

  private async agentNames() {
    const agents = await this.getAgents();
    const m = new Map(agents.map((a) => [a.agentId, a.name] as const));
    return (id: number) => m.get(id) ?? `Agent #${id}`;
  }

  // ─────────────────────────── receivables ───────────────────────────

  private receivableIds(): Hex[] {
    return this.indexer.byName("ReceivableCreated").filter((l) => l.address === lc(this.c.registry)).map((l) => String(l.args.id) as Hex);
  }

  private invoiceLabel = (id: string) => {
    const i = this.receivableIds().findIndex((x) => lc(x) === lc(id));
    return i >= 0 ? `INV-${String(i + 1).padStart(3, "0")}` : `Invoice ${id.slice(0, 8)}…`;
  };

  async getReceivables(): Promise<Receivable[]> {
    return this.cached("receivables", async () => {
      const ids = this.receivableIds();
      const out: (Receivable | null)[] = [];
      for (let i = 0; i < ids.length; i += 6) out.push(...(await Promise.all(ids.slice(i, i + 6).map((id) => this.loadReceivable(id)))));
      return out.filter((r): r is Receivable => r !== null).reverse();
    });
  }

  async getReceivable(id: ReceivableId): Promise<Receivable | null> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(id)) return null;
    await this.indexer.fresh(POLL_INTERVAL_MS);
    return this.loadReceivable(id as Hex);
  }

  private async loadReceivable(id: Hex): Promise<Receivable | null> {
    const r = await this.read<RawReceivable>(this.c.registry, receivableRegistryAbi, "get", [id]).catch(() => null);
    if (!r || r.state === 0) return null;
    const name = await this.agentNames();
    const created = this.indexer.byName("ReceivableCreated").find((l) => lc(String(l.args.id)) === lc(id));
    const repaid = this.indexer.byName("Repaid").find((l) => l.address === lc(this.c.router) && lc(String(l.args.id)) === lc(id));
    const ts = await this.indexer.timestamps(repaid ? [repaid.blockNumber] : []);
    const sellerAgentId = toAgentId(r.sellerAgentId)!;
    const buyerAgentId = toAgentId(r.buyerAgentId)!;
    const rec: Receivable = {
      id,
      invoiceNumber: this.invoiceLabel(id),
      invoiceHash: r.invoiceHash,
      seller: r.seller,
      sellerAgentId,
      sellerName: name(sellerAgentId),
      buyer: r.buyer === zeroAddress ? ((await this.agentOwner(buyerAgentId)) ?? zeroAddress) : r.buyer,
      buyerAgentId,
      buyerName: name(buyerAgentId),
      amount: r.amount,
      dueDate: Number(r.dueDate),
      createdAt: Number(r.createdAt),
      state: stateName(r.state),
      confirmedAt: r.confirmedAt > 0n ? Number(r.confirmedAt) : undefined,
      repaidAt: repaid ? ts(repaid.blockNumber) : undefined,
      txHash: (created?.transactionHash ?? zeroAddress) as Hash,
    };
    const funded = this.indexer.byName("Funded").find((l) => lc(String(l.args.id)) === lc(id));
    if (funded) {
      const adv = funded.args as { jobWallet: Address; advance: bigint; fee: bigint };
      const fts = await this.indexer.timestamps([funded.blockNumber]);
      const feeBps = adv.advance > 0n ? Number((adv.fee * 10_000n + adv.advance - 1n) / adv.advance) : 0;
      const tier = await this.read<number>(this.c.roles, autorailRolesAbi, "buyerTier", [r.buyerAgentId]).catch(() => 1);
      rec.advance = {
        receivableId: id,
        advanceBps: Number((adv.advance * 10_000n) / r.amount),
        feeBps,
        advanceAmount: adv.advance,
        feeAmount: adv.fee,
        riskBand: bandOfFee(feeBps),
        vendorScore: 50,
        buyerTier: (Math.min(3, Math.max(1, Number(tier))) as 1 | 2 | 3),
        termDays: Math.max(1, Math.round((Number(r.dueDate) - fts(funded.blockNumber)) / 86_400)),
        explanation: `Funded onchain: ${fmt6(adv.advance)} tUSD8 advanced at a ${feeBps / 100}% fee into JobWallet ${adv.jobWallet.slice(0, 10)}….`,
        underwriterAgentId: this.deployment.agents.underwriter,
        fundedAt: fts(funded.blockNumber),
        jobWallet: getAddress(adv.jobWallet),
        txHash: funded.transactionHash,
      };
    }
    return rec;
  }

  private async agentOwner(id: number) {
    return this.read<Address>(this.c.identity, identityRegistryAbi, "ownerOf", [BigInt(id)]).catch(() => undefined);
  }

  async getAdvanceOffer(receivableId: ReceivableId): Promise<AdvanceOffer | null> {
    const r = await this.getReceivable(receivableId);
    if (!r) return null;
    if (r.advance) return r.advance;
    if (r.state !== "Confirmed") return null;
    try {
      const q = await buildQuote(this.pc, this.c, receivableId as Hex, approvedPayeeList());
      if (q.offer.advanceAmount === 0n) return null;
      return {
        receivableId,
        advanceBps: Number((q.offer.advanceAmount * 10_000n) / r.amount),
        feeBps: q.offer.feeBps,
        advanceAmount: q.offer.advanceAmount,
        feeAmount: (q.offer.advanceAmount * BigInt(q.offer.feeBps) + 9_999n) / 10_000n,
        riskBand: q.band,
        vendorScore: q.vendorScore,
        buyerTier: (Math.min(3, Math.max(1, q.buyerTier)) as 1 | 2 | 3),
        termDays: q.termDays,
        explanation: q.explanation,
        underwriterAgentId: this.deployment.agents.underwriter,
      };
    } catch {
      return null;
    }
  }

  // ─────────────────────────── job wallets ───────────────────────────

  async getJobWallet(receivableId: ReceivableId): Promise<JobWallet | null> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(receivableId)) return null;
    const address = await this.read<Address>(this.c.factory, jobWalletFactoryAbi, "walletOf", [receivableId]);
    if (!address || address === zeroAddress) return null;
    await this.indexer.fresh(POLL_INTERVAL_MS);
    const [balance, closed, owner, payeesRaw] = await Promise.all([
      this.read<bigint>(address, jobWalletAbi, "balance"),
      this.read<boolean>(address, jobWalletAbi, "closed"),
      this.read<Address>(address, jobWalletAbi, "owner"),
      this.read<Address[]>(address, jobWalletAbi, "approvedPayees"),
    ]);
    const wl = this.walletLogs(address);
    const funded = this.indexer.byName("Funded").find((l) => lc(String(l.args.id)) === lc(receivableId));
    const fundedAmt = funded ? (funded.args.advance as bigint) : 0n;
    const paid = wl.filter((l) => l.eventName === "Paid");
    const spentBy = new Map<string, bigint>();
    for (const p of paid) spentBy.set(lc(String(p.args.payee)), (spentBy.get(lc(String(p.args.payee))) ?? 0n) + (p.args.amount as bigint));
    const spent = [...spentBy.values()].reduce((a, b) => a + b, 0n);
    const swept = wl.filter((l) => l.eventName === "Swept").reduce((a, l) => a + (l.args.amount as bigint), 0n);
    const sessions = wl.filter((l) => l.eventName === "SessionGranted");
    const totalCap = sessions.length ? (sessions[sessions.length - 1].args.totalCap as bigint) : fundedAmt;
    const payees: Payee[] = payeesRaw.map((p) => ({ address: p, label: this.label(p), kind: lc(p) === lc(DEMO_ADDRESSES.MERCHANT) ? "merchant" : "annotator" }));
    const per = payees.length ? totalCap / BigInt(payees.length) : 0n;
    return {
      address,
      receivableId,
      owner,
      funded: fundedAmt,
      balance,
      spent,
      swept,
      closed,
      budgetLines: payees.map((p) => {
        const s = spentBy.get(lc(p.address)) ?? 0n;
        return { payee: p.address, label: p.label, budget: s > per ? s : per, spent: s };
      }),
      payees,
    };
  }

  private walletLogs(wallet: Address) {
    return this.indexer.logs.filter((l) => l.address === lc(wallet));
  }

  async getSessions(jobWallet: Address): Promise<Session[]> {
    await this.indexer.fresh(POLL_INTERVAL_MS);
    const wl = this.walletLogs(jobWallet);
    const grants = wl.filter((l) => l.eventName === "SessionGranted");
    const revokes = wl.filter((l) => l.eventName === "SessionKeyRevoked");
    const ts = await this.indexer.timestamps([...grants, ...revokes].map((l) => l.blockNumber));
    const latest = new Map<string, DecodedLog>();
    for (const g of grants) latest.set(lc(String(g.args.key)), g);
    const out: Session[] = [];
    for (const [key, g] of latest) {
      const s = await this.read<{ expiry: bigint; revoked: boolean; perTxCap: bigint; totalCap: bigint; spent: bigint }>(jobWallet, jobWalletAbi, "sessionOf", [key]);
      const rv = revokes.filter((r) => lc(String(r.args.key)) === key && r.blockNumber >= g.blockNumber).at(-1);
      out.push({
        id: `${g.transactionHash}:${g.logIndex}`,
        jobWallet,
        key: getAddress(key),
        label: this.label(key),
        payees: (g.args.payees as Address[]).map((p) => getAddress(p)),
        perTxCap: s.perTxCap,
        totalCap: s.totalCap,
        spent: s.spent,
        grantedAt: ts(g.blockNumber),
        expiresAt: Number(s.expiry),
        revoked: s.revoked,
        revokedAt: rv ? ts(rv.blockNumber) : undefined,
        txHash: g.transactionHash,
      });
    }
    return out;
  }

  async getPayments(jobWallet: Address): Promise<Payment[]> {
    await this.indexer.fresh(POLL_INTERVAL_MS);
    const paid = this.walletLogs(jobWallet).filter((l) => l.eventName === "Paid");
    const ts = await this.indexer.timestamps(paid.map((l) => l.blockNumber));
    const out: Payment[] = paid.map((l) => ({
      id: `${l.transactionHash}:${l.logIndex}`,
      jobWallet,
      sessionKey: getAddress(String(l.args.key)),
      payee: getAddress(String(l.args.payee)),
      payeeLabel: this.label(String(l.args.payee)),
      amount: l.args.amount as bigint,
      memo: String(l.args.memo),
      status: "paid",
      txHash: l.transactionHash,
      block: l.blockNumber,
      timestamp: ts(l.blockNumber),
    }));
    out.push(...(await this.blockedPayments(jobWallet)));
    return out.sort((a, b) => b.block - a.block);
  }

  /**
   * Blocked attempts are reverted transactions: they emit no events. On Aevum they come from the Blockscout txlist
   * (isError = 1), decoded with the JobWallet ABI and re-run with eth_call for the custom error. Elsewhere (fork)
   * the server's record of its own agent attempts is used.
   */
  private async blockedPayments(jobWallet: Address): Promise<Payment[]> {
    const key = `blocked:${lc(jobWallet)}`;
    const hit = this.memo.get(key);
    if (hit && Date.now() - Number(hit.at) < 15_000) return hit.value as Payment[];
    let list: Payment[] = [];
    try {
      if (!isLiveAevum) throw new Error("no explorer");
      const txs = (await blockscoutTxs(jobWallet)).filter((t) => t.isError === "1" && lc(t.to ?? "") === lc(jobWallet));
      for (const t of txs) {
        if (!this.blockedCache.has(t.hash)) this.blockedCache.set(t.hash, await this.decodeBlocked(jobWallet, t));
        const p = this.blockedCache.get(t.hash);
        if (p) list.push(p);
      }
    } catch {
      try {
        const res = await fetch(`/api/agents/blocked?wallet=${jobWallet}`);
        if (res.ok) {
          const body = (await res.json()) as { blocked: { payee: Address; payeeLabel: string; amount: string; hash: Hash; errorName?: string; block: number; timestamp: number; from: Address; note?: string }[] };
          list = body.blocked.map((b) => ({
            id: b.hash,
            jobWallet,
            sessionKey: b.from,
            payee: b.payee,
            payeeLabel: b.payeeLabel,
            amount: BigInt(b.amount),
            memo: b.note ?? "",
            status: "blocked",
            revertReason: reasonText(b.errorName),
            txHash: b.hash,
            block: b.block,
            timestamp: b.timestamp,
          }));
        }
      } catch {
        /* no fallback available */
      }
    }
    this.memo.set(key, { at: Date.now(), value: list });
    return list;
  }

  private async decodeBlocked(jobWallet: Address, t: { hash: Hash; from: Address; input: Hex; blockNumber: string; timeStamp: string }): Promise<Payment | null> {
    let fn;
    try {
      fn = decodeFunctionData({ abi: jobWalletAbi, data: t.input });
    } catch {
      return null;
    }
    if (fn.functionName !== "pay") return null;
    const [payee, amount, memo] = fn.args as [Address, bigint, Hex];
    const errorName = await this.revertName(t.from, { address: jobWallet, abi: jobWalletAbi as unknown as Abi, functionName: "pay", args: [payee, amount, memo] }, BigInt(t.blockNumber) - 1n);
    return {
      id: t.hash,
      jobWallet,
      sessionKey: getAddress(t.from),
      payee: getAddress(payee),
      payeeLabel: this.label(payee),
      amount,
      memo,
      status: "blocked",
      revertReason: reasonText(errorName),
      txHash: t.hash,
      block: Number(t.blockNumber),
      timestamp: Number(t.timeStamp),
    };
  }

  private async revertName(from: Address, call: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] }, block?: bigint) {
    for (const blockNumber of block !== undefined ? [block, undefined] : [undefined]) {
      try {
        await this.pc.simulateContract({ ...call, abi: [...call.abi, ...ALL_ERRORS], account: from, ...(blockNumber !== undefined ? { blockNumber } : {}) } as never);
      } catch (e) {
        if (e instanceof BaseError) {
          const rev = e.walk((x) => x instanceof ContractFunctionRevertedError);
          if (rev instanceof ContractFunctionRevertedError) {
            if (rev.data?.errorName) return rev.data.errorName;
            const raw = decodeRevertData(rev.raw);
            if (raw) return raw.name;
            if (rev.reason) return rev.reason;
          }
        }
      }
    }
    return "Unknown";
  }

  async getRepayment(receivableId: ReceivableId): Promise<Repayment | null> {
    await this.indexer.fresh(POLL_INTERVAL_MS);
    const r = this.indexer.byName("Repaid").find((l) => l.address === lc(this.c.router) && lc(String(l.args.id)) === lc(receivableId));
    if (!r) return null;
    const v = this.indexer.logs.find((l) => l.transactionHash === r.transactionHash && l.address === lc(this.c.vault) && l.eventName === "Repaid");
    const ts = await this.indexer.timestamps([r.blockNumber]);
    const a = r.args as { vaultAmount: bigint; sellerAmount: bigint; swept: bigint };
    const principal = v ? (v.args.principal as bigint) : a.vaultAmount;
    const fee = v ? (v.args.fee as bigint) : 0n;
    return {
      receivableId,
      total: a.vaultAmount + a.sellerAmount,
      vaultPrincipal: principal,
      vaultFee: fee,
      vendorRemainder: a.sellerAmount,
      unspentSwept: a.swept,
      txHash: r.transactionHash,
      block: r.blockNumber,
      timestamp: ts(r.blockNumber),
    };
  }

  async getActivity(filter: ActivityFilter = {}): Promise<ActivityEvent[]> {
    const all = await this.cached("activity", async () => {
      const name = await this.agentNames();
      const ts = await this.indexer.timestamps(this.indexer.logs.map((l) => l.blockNumber));
      const walletRid = new Map(this.indexer.byName("JobWalletCreated").map((l) => [lc(String(l.args.wallet)), String(l.args.receivableId)] as const));
      const ctx: ActivityContext = {
        invoiceLabel: this.invoiceLabel,
        label: this.label,
        agentName: name,
        walletReceivable: (a) => walletRid.get(lc(a)),
        timestamp: ts,
        fmt: fmt6,
      };
      const rows = this.indexer.logs.map((l) => toActivity(l, ctx)).filter((x): x is ActivityEvent => x !== null);
      for (const [w, rid] of walletRid) {
        for (const b of await this.blockedPayments(getAddress(w))) {
          rows.push({
            id: b.id,
            type: "payment.blocked",
            title: `Blocked: ${fmt6(b.amount)} tUSD8 → ${b.payeeLabel}`,
            status: "blocked",
            revertReason: b.revertReason,
            receivableId: rid,
            agentId: this.deployment.agents.payout,
            actor: this.label(b.sessionKey ?? ""),
            txHash: b.txHash,
            block: b.block,
            timestamp: b.timestamp,
          });
        }
      }
      return rows.sort((a, b) => b.block - a.block || b.id.localeCompare(a.id));
    });
    let rows = all;
    if (filter.receivableId !== undefined) rows = rows.filter((r) => r.receivableId !== undefined && lc(r.receivableId) === lc(filter.receivableId!));
    if (filter.agentId !== undefined) rows = rows.filter((r) => r.agentId === filter.agentId);
    if (filter.types?.length) rows = rows.filter((r) => filter.types!.includes(r.type));
    return filter.limit !== undefined ? rows.slice(0, filter.limit) : rows;
  }

  // ─────────────────────────── typed data ───────────────────────────

  async getConfirmationTypedData(receivableId: ReceivableId): Promise<TypedDataPayload> {
    const r = await this.read<RawReceivable>(this.c.registry, receivableRegistryAbi, "get", [receivableId]);
    const buyer = this.wallet?.account?.address ?? (await this.agentOwner(toAgentId(r.buyerAgentId)!)) ?? zeroAddress;
    const nonce = await this.read<bigint>(this.c.registry, receivableRegistryAbi, "nonces", [buyer]);
    return {
      domain: { name: "Autorail ReceivableRegistry", version: "1", chainId: TARGET_CHAIN_ID, verifyingContract: this.c.registry },
      types: CONFIRMATION_TYPES as unknown as TypedDataPayload["types"],
      primaryType: "Confirmation",
      message: {
        id: receivableId,
        invoiceHash: r.invoiceHash,
        seller: r.seller,
        buyer,
        amount: r.amount,
        dueDate: r.dueDate,
        payee: this.c.router,
        nonce,
        deadline: nowSec() + 3600n,
      },
    };
  }

  async getPaymentTypedData(receivableId: ReceivableId): Promise<TypedDataPayload> {
    const r = await this.read<RawReceivable>(this.c.registry, receivableRegistryAbi, "get", [receivableId]);
    const from = this.wallet?.account?.address ?? r.buyer;
    const nonce = await this.read<Hex>(this.c.router, repaymentRouterAbi, "authorizationNonce", [receivableId]);
    const domain = await tusd8Domain(this.pc, this.deployment.tUSD8, TARGET_CHAIN_ID);
    return {
      domain,
      types: RECEIVE_TYPES as unknown as TypedDataPayload["types"],
      primaryType: "ReceiveWithAuthorization",
      message: { from, to: this.c.router, value: r.amount, validAfter: 0n, validBefore: nowSec() + 3600n, nonce },
    };
  }

  // ─────────────────────────── writes ───────────────────────────

  /**
   * Connected wallet on the right chain, with enough tQDAY for gas: checked BEFORE any signature, so the user gets a
   * plain-English message instead of a wallet error halfway through. Gasless actions (Lab pay) pass needsGas: false.
   */
  private async signer({ needsGas = true }: { needsGas?: boolean } = {}) {
    const w = this.wallet;
    if (!w?.account) throw new AutorailError("NotConnected");
    const chainId = await w.getChainId().catch(() => w.chain?.id);
    if (chainId !== TARGET_CHAIN_ID) throw new AutorailError("WrongChain");
    if (needsGas) {
      const bal = await this.pc.getBalance({ address: w.account.address });
      if (bal < MIN_GAS) throw new AutorailError("InsufficientGas", `You have ${formatAmount(bal, { decimals: 18, maxFrac: 4 })} tQDAY; a transaction needs about 0.001.`);
    }
    return { w, account: w.account };
  }

  private async requireTusd8(address: Address, needed: bigint, what: string) {
    const bal = await this.read<bigint>(this.deployment.tUSD8, ERC20 as unknown as Abi, "balanceOf", [address]);
    if (bal < needed) throw new AutorailError("InsufficientTusd8", `${what} needs ${formatAmount(needed)} tUSD8; this wallet has ${formatAmount(bal)}.`);
  }

  /** Wait for a tx sent earlier (e.g. before the user navigated away) and refresh the read model. */
  async waitForTx(hash: Hash): Promise<WriteResult> {
    const receipt = await this.pc.waitForTransactionReceipt({ hash, pollingInterval: 1_500, timeout: 180_000 });
    await this.indexer.until(receipt.blockNumber).catch(() => undefined);
    this.emit();
    if (receipt.status !== "success") throw new AutorailError("Unknown", "The transaction reverted.", hash);
    return { hash, block: Number(receipt.blockNumber) };
  }

  /** Which Autorail roles this wallet's ERC-8004 agents hold (agent ids start at 0: check `ok`, not the id). */
  async getOnboardingStatus(address: Address) {
    const [seller, buyer] = await Promise.all(
      [1, 2].map((r) => this.read<[boolean, bigint]>(this.c.roles, autorailRolesAbi, "isAgent", [address, r])),
    );
    return { seller: seller[0] ? Number(seller[1]) : null, buyer: buyer[0] ? Number(buyer[1]) : null };
  }

  /** Ask our Frontier Lab agent to confirm an onboarded vendor's invoice (≤ 0.20 tUSD8). */
  async requestLabConfirm(receivableId: ReceivableId): Promise<{ confirmed: boolean; txHash: Hash | null }> {
    const res = await fetch("/api/lab/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ receivableId }) });
    const body = await res.json();
    if (!res.ok) throw body;
    await this.indexer.sync().catch(() => undefined);
    this.emit();
    return body;
  }

  private async signTyped(p: TypedDataPayload, opts?: WriteOptions, needsGas = true): Promise<Hex> {
    const { w, account } = await this.signer({ needsGas });
    opts?.onStage?.("signing");
    return w.signTypedData({ account, domain: p.domain, types: p.types, primaryType: p.primaryType, message: p.message } as never);
  }

  /** Simulate (decoded revert before any signature), then send a legacy tx and wait for the receipt. */
  private async write(call: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] }, opts?: WriteOptions): Promise<WriteResult & { receipt: TransactionReceipt }> {
    const { w, account } = await this.signer();
    await this.pc.simulateContract({ ...call, abi: [...call.abi, ...ALL_ERRORS], args: call.args ?? [], account } as never);
    opts?.onStage?.("signing");
    const hash = await w.writeContract({ ...call, abi: [...call.abi, ...ALL_ERRORS], args: call.args ?? [], account, chain: targetChain, type: "legacy" } as never);
    opts?.onStage?.("pending", hash);
    const receipt = await this.pc.waitForTransactionReceipt({ hash, pollingInterval: 1_500, timeout: 180_000 });
    if (receipt.status !== "success") {
      const name = await this.revertName(account.address, { ...call, args: call.args ?? [] }, receipt.blockNumber - 1n);
      throw new AutorailError(name in ERROR_MESSAGES ? (name as AutorailErrorCode) : "Unknown", undefined, hash);
    }
    await this.indexer.until(receipt.blockNumber).catch(() => undefined);
    this.emit();
    return { hash, block: Number(receipt.blockNumber), receipt };
  }

  private eventsIn(receipt: TransactionReceipt, abi: Abi, address: Address) {
    const out: { eventName: string; args: Record<string, unknown> }[] = [];
    for (const l of receipt.logs) {
      if (lc(l.address) !== lc(address)) continue;
      try {
        out.push(decodeEventLog({ abi, data: l.data, topics: l.topics }) as never);
      } catch {
        /* other event */
      }
    }
    return out;
  }

  async depositWithPermit(amount: Amount, opts?: WriteOptions): Promise<WriteResult> {
    if (amount <= 0n) throw new AutorailError("ZeroAmount");
    const { account } = await this.signer();
    await this.requireTusd8(account.address, amount, "This deposit");
    const nonce = await this.read<bigint>(this.deployment.tUSD8, ERC20 as unknown as Abi, "nonces", [account.address]);
    const deadline = nowSec() + 3600n;
    const domain = await tusd8Domain(this.pc, this.deployment.tUSD8, TARGET_CHAIN_ID);
    const sig = await this.signTyped(
      { domain, types: PERMIT_TYPES as unknown as TypedDataPayload["types"], primaryType: "Permit", message: { owner: account.address, spender: this.c.vault, value: amount, nonce, deadline } },
      opts,
    );
    const { v, r, s, yParity } = parseSignature(sig);
    const vv = v !== undefined ? Number(v) : 27 + (yParity ?? 0);
    return this.write({ address: this.c.vault, abi: autorailVaultAbi as unknown as Abi, functionName: "depositWithPermit", args: [amount, account.address, deadline, vv, r, s] }, opts);
  }

  async withdraw(amount: Amount, opts?: WriteOptions): Promise<WriteResult> {
    if (amount <= 0n) throw new AutorailError("ZeroAmount");
    const { account } = await this.signer();
    const pos = await this.getLenderPosition(account.address);
    if (amount > pos.maxWithdraw) throw new AutorailError("InsufficientLiquidity", `You can withdraw up to ${fmt6(pos.maxWithdraw)} tUSD8 right now (idle liquidity).`);
    return this.write({ address: this.c.vault, abi: autorailVaultAbi as unknown as Abi, functionName: "withdraw", args: [amount, account.address, account.address] }, opts);
  }

  async registerAgent(input: RegisterAgentInput, opts?: WriteOptions): Promise<WriteResult & { agentId: number }> {
    const res = await this.write({ address: this.c.identity, abi: identityRegistryAbi as unknown as Abi, functionName: "register", args: [input.metadataURI] }, opts);
    const ev = this.eventsIn(res.receipt, identityRegistryAbi as unknown as Abi, this.c.identity).find((e) => e.eventName === "Registered");
    return { hash: res.hash, block: res.block, agentId: toAgentId(ev?.args.agentId as bigint)! };
  }

  async createReceivable(input: CreateReceivableInput, opts?: WriteOptions): Promise<WriteResult & { receivableId: ReceivableId }> {
    const agents = await this.getAgents();
    const buyer = agents.find((a) => a.role === "buyer" && (lc(a.owner) === lc(input.buyer) || lc(a.address) === lc(input.buyer)));
    const buyerAgentId = buyer ? buyer.agentId : this.deployment.agents["frontier-lab"];
    const res = await this.write(
      { address: this.c.registry, abi: receivableRegistryAbi as unknown as Abi, functionName: "create", args: [input.invoiceHash, BigInt(buyerAgentId), input.amount, BigInt(input.dueDate)] },
      opts,
    );
    const ev = this.eventsIn(res.receipt, receivableRegistryAbi as unknown as Abi, this.c.registry).find((e) => e.eventName === "ReceivableCreated");
    return { hash: res.hash, block: res.block, receivableId: String(ev?.args.id) };
  }

  async confirmReceivable(receivableId: ReceivableId, opts?: WriteOptions): Promise<WriteResult> {
    const { account } = await this.signer();
    const td = await this.getConfirmationTypedData(receivableId);
    const sig = await this.signTyped(td, opts);
    return this.write(
      { address: this.c.registry, abi: receivableRegistryAbi as unknown as Abi, functionName: "confirm", args: [receivableId, account.address, this.c.router, td.message.deadline, sig] },
      opts,
    );
  }

  async fundAdvance(receivableId: ReceivableId, opts?: WriteOptions): Promise<WriteResult & { jobWallet: Address }> {
    await this.signer();
    const res = await fetch("/api/underwrite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ receivableId }) });
    const body = await res.json();
    if (!res.ok) throw body; // { code, message } → decodeError
    const o = body.offer as { receivableId: Hex; advanceAmount: string; feeBps: number; payees: Address[]; offerExpiry: string; nonce: string };
    const offer = { receivableId: o.receivableId, advanceAmount: BigInt(o.advanceAmount), feeBps: o.feeBps, payees: o.payees, offerExpiry: BigInt(o.offerExpiry), nonce: BigInt(o.nonce) };
    const sent = await this.write({ address: this.c.facility, abi: creditFacilityAbi as unknown as Abi, functionName: "fund", args: [offer, body.signature] }, opts);
    const ev = this.eventsIn(sent.receipt, creditFacilityAbi as unknown as Abi, this.c.facility).find((e) => e.eventName === "Funded");
    return { hash: sent.hash, block: sent.block, jobWallet: getAddress(String(ev?.args.jobWallet)) };
  }

  async grantSession(jobWallet: Address, input: GrantSessionInput, opts?: WriteOptions): Promise<WriteResult> {
    return this.write(
      { address: jobWallet, abi: jobWalletAbi as unknown as Abi, functionName: "grantSession", args: [input.key, BigInt(input.expiresAt), input.perTxCap, input.totalCap, input.payees] },
      opts,
    );
  }

  async revokeSession(jobWallet: Address, key: Address, opts?: WriteOptions): Promise<WriteResult> {
    return this.write({ address: jobWallet, abi: jobWalletAbi as unknown as Abi, functionName: "revokeSession", args: [key] }, opts);
  }

  async pay(jobWallet: Address, input: PayInput, opts?: WriteOptions): Promise<WriteResult> {
    const memo = /^0x[0-9a-fA-F]{64}$/.test(input.memo) ? input.memo : `0x${Array.from(new TextEncoder().encode(input.memo.slice(0, 32)), (b) => b.toString(16).padStart(2, "0")).join("").padEnd(64, "0")}`;
    return this.write({ address: jobWallet, abi: jobWalletAbi as unknown as Abi, functionName: "pay", args: [input.payee, input.amount, memo] }, opts);
  }

  async payInvoice(receivableId: ReceivableId, opts?: WriteOptions): Promise<WriteResult & { repayment: Repayment }> {
    const { account } = await this.signer({ needsGas: false }); // gasless: the relayer pays
    const td = await this.getPaymentTypedData(receivableId);
    await this.requireTusd8(account.address, td.message.value as bigint, "Paying this invoice");
    const signature = await this.signTyped(td, opts, false);
    const m = td.message as { from: Address; value: bigint; validAfter: bigint; validBefore: bigint; nonce: Hex };
    const res = await fetch("/api/relay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ receivableId, from: m.from, value: String(m.value), validAfter: String(m.validAfter), validBefore: String(m.validBefore), nonce: m.nonce, signature }),
    });
    const body = await res.json();
    if (!res.ok) throw body;
    opts?.onStage?.("pending", body.hash);
    await this.indexer.until(body.block);
    this.emit();
    const repayment = await this.getRepayment(receivableId);
    if (!repayment) throw new AutorailError("Unknown", "The repayment was mined but isn't indexed yet.", body.hash);
    return { hash: body.hash, block: body.block, repayment };
  }

  async markOverdue(receivableId: ReceivableId, opts?: WriteOptions): Promise<WriteResult> {
    return this.write({ address: this.c.facility, abi: creditFacilityAbi as unknown as Abi, functionName: "markOverdue", args: [receivableId] }, opts);
  }

  // ─────────────────────────── demo runner ───────────────────────────

  getDemoMode(): DemoMode {
    return this.demoMode;
  }

  async setDemoMode(mode: DemoMode) {
    this.demoMode = mode === "live" ? "live" : "recorded";
    this.emit();
  }

  async demoPreflight(): Promise<LivePreflight> {
    const res = await fetch("/api/demo/live", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "preflight" }) });
    const body = await res.json();
    if (!res.ok) throw body;
    return body as LivePreflight;
  }

  async getDemoSteps(): Promise<DemoStep[]> {
    if (this.demoMode === "live") {
      return RECORDED_RUN_ORDER.map((key) => {
        const meta = STEP_META[key];
        const rec = RECORDED_RUN.orderedSteps.find((s) => s.step === key);
        const st = this.live?.steps[key];
        return {
          id: key,
          title: LIVE_TITLES[key] ?? rec?.title ?? key,
          description: meta.description,
          actor: meta.actor,
          proof: meta.proof,
          expectsRevert: !!meta.expect,
          status: !st ? "pending" : st.status === "failed" ? "failed" : "done",
          txHashes: st?.txHashes ?? [],
          result: st ? (st.decodedError && st.status !== "failed" ? `Reverted onchain: ${st.decodedError}. ${reasonText(st.decodedError)}` : st.note) : undefined,
          error: st?.status === "failed" ? `${st.decodedError ?? "Error"}: ${st.note ?? ""}` : undefined,
        };
      });
    }
    // Recorded run: replay demo-run-44005.json in the explicit order.
    return RECORDED_RUN_ORDER.map((key) => {
      const meta = STEP_META[key];
      const rec = RECORDED_RUN.orderedSteps.find((s) => s.step === key) as
        | { title: string; status: string; txHashes: readonly string[]; note?: string; decodedError?: string; amounts?: Record<string, string> }
        | undefined;
      const err = rec?.decodedError;
      return {
        id: key,
        title: rec?.title ?? key,
        description: meta.description,
        actor: meta.actor,
        amount: rec?.amounts ? Object.values(rec.amounts)[0] : undefined,
        proof: meta.proof,
        expectsRevert: !!meta.expect,
        status: rec ? "done" : "pending",
        txHashes: (rec?.txHashes ?? []) as Hash[],
        result: err ? `Reverted onchain: ${err}. ${reasonText(err)}` : rec?.note,
      };
    });
  }

  async runDemoStep(stepId: string, opts?: WriteOptions): Promise<DemoStep> {
    if (this.demoMode === "recorded") {
      // replay: nothing is sent; the step already has its explorer-verifiable tx hashes
      return (await this.getDemoSteps()).find((s) => s.id === stepId)!;
    }
    if (!this.live) await this.startLiveRun();
    opts?.onStage?.("pending");
    const res = await fetch("/api/demo/live", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "step", runId: this.live!.runId, step: stepId }),
    });
    const body = await res.json();
    if (!res.ok) throw body;
    this.live!.steps[stepId] = body;
    if (body.txHashes?.length) opts?.onStage?.("pending", body.txHashes[body.txHashes.length - 1]);
    await (body.block ? this.indexer.until(body.block) : this.indexer.sync()).catch(() => undefined);
    this.emit();
    return (await this.getDemoSteps()).find((s) => s.id === stepId)!;
  }

  private async startLiveRun() {
    const res = await fetch("/api/demo/live", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start" }) });
    const body = await res.json();
    if (!res.ok) throw body;
    this.live = { runId: body.runId, receivableId: body.receivableId, steps: {} };
  }

  /** Onchain there is no reset: "fresh" starts a new live run, anything else returns to the recorded run. */
  async resetDemo(preset: DemoPreset) {
    if (preset === "fresh") {
      this.demoMode = "live";
      this.live = undefined;
      await this.startLiveRun();
    } else {
      this.demoMode = "recorded";
    }
    this.emit();
  }

  get liveRun() {
    return this.live;
  }
}

function approvedPayeeList(): Address[] {
  return [DEMO_ADDRESSES.ANNOTATOR_A, DEMO_ADDRESSES.ANNOTATOR_B, DEMO_ADDRESSES.MERCHANT].map((a) => getAddress(a));
}

function reasonText(name?: string) {
  if (!name) return ERROR_MESSAGES.Unknown;
  const bare = name.split("(")[0];
  return (ERROR_MESSAGES as Record<string, string>)[bare] ?? bare;
}

