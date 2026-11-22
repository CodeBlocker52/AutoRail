import type { WalletClient } from "viem";
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
  LivePreflight,
  DemoStep,
  GrantSessionInput,
  Hash,
  JobWallet,
  LenderPosition,
  PayInput,
  Payment,
  Receivable,
  RegisterAgentInput,
  Repayment,
  ReceivableId,
  Role,
  Session,
  TypedDataPayload,
  VaultStats,
  WriteOptions,
  WriteResult,
} from "./types";

/**
 * Every read and write the UI needs. The UI talks only to hooks; hooks talk only to this.
 * Implementations: `mock.ts` (in-memory demo) and `onchain.ts` (viem + Aevum contracts).
 */
export interface AutorailClient {
  readonly mode: "mock" | "onchain";

  /** Change notifications. Mock emits after each write; onchain relies on polling. */
  subscribe(listener: () => void): () => void;
  /** Attach the connected wallet for writes (onchain only; mock ignores). */
  setWalletClient(wallet: WalletClient | undefined): void;
  /** Address that acts for a demo role. Mock: scripted wallets. Onchain: the connected wallet. */
  resolveActor(role: Role, connected?: Address): Address | undefined;

  // ── Reads ─────────────────────────────────────────────
  getBalances(account: Address): Promise<Balances>;
  getVaultStats(): Promise<VaultStats>;
  getLenderPosition(account: Address): Promise<LenderPosition>;
  getAgents(): Promise<Agent[]>;
  getReceivables(): Promise<Receivable[]>;
  getReceivable(id: ReceivableId): Promise<Receivable | null>;
  getAdvanceOffer(receivableId: ReceivableId): Promise<AdvanceOffer | null>;
  getJobWallet(receivableId: ReceivableId): Promise<JobWallet | null>;
  getSessions(jobWallet: Address): Promise<Session[]>;
  getPayments(jobWallet: Address): Promise<Payment[]>;
  getRepayment(receivableId: ReceivableId): Promise<Repayment | null>;
  getActivity(filter?: ActivityFilter): Promise<ActivityEvent[]>;
  /** EIP-712 typed data the buyer signs to confirm an invoice. */
  getConfirmationTypedData(receivableId: ReceivableId): Promise<TypedDataPayload>;
  /** EIP-3009 ReceiveWithAuthorization typed data the buyer signs to pay. */
  getPaymentTypedData(receivableId: ReceivableId): Promise<TypedDataPayload>;
  getDemoSteps(): Promise<DemoStep[]>;

  // ── Writes (each reports stages via opts.onStage) ─────
  depositWithPermit(amount: Amount, opts?: WriteOptions): Promise<WriteResult>;
  withdraw(amount: Amount, opts?: WriteOptions): Promise<WriteResult>;
  registerAgent(input: RegisterAgentInput, opts?: WriteOptions): Promise<WriteResult & { agentId: number }>;
  createReceivable(input: CreateReceivableInput, opts?: WriteOptions): Promise<WriteResult & { receivableId: ReceivableId }>;
  confirmReceivable(receivableId: ReceivableId, opts?: WriteOptions): Promise<WriteResult>;
  /** Underwriter-signed funding: vault → new JobWallet. */
  fundAdvance(receivableId: ReceivableId, opts?: WriteOptions): Promise<WriteResult & { jobWallet: Address }>;
  grantSession(jobWallet: Address, input: GrantSessionInput, opts?: WriteOptions): Promise<WriteResult>;
  revokeSession(jobWallet: Address, key: Address, opts?: WriteOptions): Promise<WriteResult>;
  pay(jobWallet: Address, input: PayInput, opts?: WriteOptions): Promise<WriteResult>;
  /** Buyer signs EIP-3009; relayer submits; router runs the lenders-first waterfall. */
  payInvoice(receivableId: ReceivableId, opts?: WriteOptions): Promise<WriteResult & { repayment: Repayment }>;
  markOverdue(receivableId: ReceivableId, opts?: WriteOptions): Promise<WriteResult>;

  // ── Demo runner ───────────────────────────────────────
  runDemoStep(stepId: string, opts?: WriteOptions): Promise<DemoStep>;
  /** Mock: always "mock". Onchain: "recorded" (replay, default) or "live". */
  getDemoMode(): DemoMode;
  setDemoMode(mode: DemoMode): Promise<void>;
  /** Wait for a previously sent tx (pending-state recovery after navigation). Onchain only. */
  waitForTx?(hash: Hash): Promise<WriteResult>;
  /** Which roles the wallet's ERC-8004 agents hold. Onchain only. */
  getOnboardingStatus?(address: Address): Promise<{ seller: number | null; buyer: number | null }>;
  /** Ask our Frontier Lab agent to auto-confirm an onboarded vendor's invoice. Onchain only. */
  requestLabConfirm?(receivableId: ReceivableId): Promise<{ confirmed: boolean; txHash: Hash | null }>;
  /** Live-run balance/liquidity checks (onchain only). */
  demoPreflight?(): Promise<LivePreflight>;
  resetDemo(preset: DemoPreset): Promise<void>;
}
