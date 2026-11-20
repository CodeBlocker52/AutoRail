import type { Address, Hash } from "viem";

export type { Address, Hash };

/** All tUSD8 amounts are bigint with 6 decimals. Timestamps are unix seconds. */
export type Amount = bigint;
export type Timestamp = number;

export type Role = "lender" | "vendor" | "lab" | "agents";

export type AgentRole = "seller" | "buyer" | "underwriter" | "payout" | "merchant";

export interface ReputationEntry {
  timestamp: Timestamp;
  /** 0–100 score after this feedback. */
  score: number;
  tag: "registered" | "repaid_on_time" | "repaid_late" | "defaulted";
  note: string;
  /** Advance limit the underwriter allows after this entry. */
  advanceLimit: Amount;
  txHash?: Hash;
}

export interface Agent {
  /** ERC-8004 identity NFT id. */
  agentId: number;
  name: string;
  role: AgentRole;
  /** Agent's signing address (session key for payout agents). */
  address: Address;
  /** Owner/operator wallet (for the seller: the vendor treasury). */
  owner: Address;
  metadataURI: string;
  status: "online" | "idle" | "blocked";
  lastAction?: string;
  lastActionAt?: Timestamp;
  reputation: ReputationEntry[];
  registeredAt: Timestamp;
  txHash?: Hash;
}

export const RECEIVABLE_STATES = ["Created", "Confirmed", "Funded", "Repaid", "Overdue", "Defaulted"] as const;
export type ReceivableState = (typeof RECEIVABLE_STATES)[number];

export type RiskBand = "A" | "B" | "C" | "D";

export interface AdvanceOffer {
  receivableId: number;
  advanceBps: number;
  feeBps: number;
  advanceAmount: Amount;
  feeAmount: Amount;
  riskBand: RiskBand;
  vendorScore: number;
  buyerTier: 1 | 2 | 3;
  termDays: number;
  /** Plain-English explanation written by the underwriting agent (LLM explains, rules decide). */
  explanation: string;
  underwriterAgentId: number;
}

export interface Advance extends AdvanceOffer {
  fundedAt: Timestamp;
  jobWallet: Address;
  txHash: Hash;
}

export interface Receivable {
  id: number;
  invoiceNumber: string;
  invoiceHash: Hash;
  seller: Address;
  sellerAgentId: number;
  sellerName: string;
  buyer: Address;
  buyerAgentId: number;
  buyerName: string;
  amount: Amount;
  dueDate: Timestamp;
  createdAt: Timestamp;
  state: ReceivableState;
  confirmedAt?: Timestamp;
  repaidAt?: Timestamp;
  advance?: Advance;
  txHash: Hash;
}

export interface Payee {
  address: Address;
  label: string;
  kind: "annotator" | "expert" | "merchant";
}

export interface BudgetLine {
  payee: Address;
  label: string;
  budget: Amount;
  spent: Amount;
}

export interface JobWallet {
  address: Address;
  receivableId: number;
  owner: Address;
  funded: Amount;
  balance: Amount;
  spent: Amount;
  /** Unspent balance swept back at repayment. */
  swept: Amount;
  closed: boolean;
  budgetLines: BudgetLine[];
  payees: Payee[];
}

export type SessionStatus = "active" | "expired" | "revoked";

export interface Session {
  id: string;
  jobWallet: Address;
  key: Address;
  label: string;
  payees: Address[];
  perTxCap: Amount;
  totalCap: Amount;
  spent: Amount;
  grantedAt: Timestamp;
  expiresAt: Timestamp;
  revoked: boolean;
  revokedAt?: Timestamp;
  txHash: Hash;
}

export interface Payment {
  id: string;
  jobWallet: Address;
  sessionKey?: Address;
  payee: Address;
  payeeLabel: string;
  amount: Amount;
  memo: string;
  status: "paid" | "blocked";
  revertReason?: string;
  txHash: Hash;
  block: number;
  timestamp: Timestamp;
}

export interface Repayment {
  receivableId: number;
  total: Amount;
  vaultPrincipal: Amount;
  vaultFee: Amount;
  vendorRemainder: Amount;
  unspentSwept: Amount;
  txHash: Hash;
  block: number;
  timestamp: Timestamp;
}

export interface VaultPoint {
  timestamp: Timestamp;
  totalAssets: Amount;
  utilizationBps: number;
}

export interface VaultStats {
  totalAssets: Amount;
  idle: Amount;
  outstanding: Amount;
  totalShares: Amount;
  repaidPrincipal: Amount;
  feesEarned: Amount;
  defaults: Amount;
  utilizationBps: number;
  estApyBps: number;
  activeAdvances: number;
  history: VaultPoint[];
}

export interface LenderPosition {
  shares: Amount;
  value: Amount;
  deposited: Amount;
  earned: Amount;
  maxWithdraw: Amount;
}

export interface Balances {
  tUSD8: Amount;
  /** 18 decimals. */
  tQDAY: bigint;
}

export type ActivityType =
  | "vault.deposit"
  | "vault.withdraw"
  | "agent.registered"
  | "invoice.created"
  | "invoice.confirmed"
  | "advance.funded"
  | "session.granted"
  | "session.revoked"
  | "payment.sent"
  | "payment.blocked"
  | "invoice.repaid"
  | "invoice.overdue"
  | "reputation.updated";

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  title: string;
  detail?: string;
  status: "ok" | "blocked" | "info";
  /** Plain-English revert reason for blocked events. */
  revertReason?: string;
  receivableId?: number;
  agentId?: number;
  actor?: string;
  txHash: Hash;
  block: number;
  timestamp: Timestamp;
}

export interface ActivityFilter {
  receivableId?: number;
  agentId?: number;
  types?: ActivityType[];
  limit?: number;
}

export type DemoStepStatus = "pending" | "running" | "done" | "failed";

export interface DemoStep {
  id: number;
  title: string;
  description: string;
  actor: Role;
  amount?: string;
  proof: string;
  /** True if the step is expected to revert onchain (safety demos). */
  expectsRevert?: boolean;
  status: DemoStepStatus;
  txHashes: Hash[];
  result?: string;
  error?: string;
}

export interface TypedDataPayload {
  domain: { name: string; version: string; chainId: number; verifyingContract: Address };
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
}

export interface WriteResult {
  hash: Hash;
  block: number;
}

export type TxStage = "idle" | "signing" | "pending" | "confirmed" | "failed";

export interface WriteOptions {
  /** Called as the write moves through wallet signature → mined. */
  onStage?: (stage: "signing" | "pending", hash?: Hash) => void;
}

export interface RegisterAgentInput {
  name: string;
  role: AgentRole;
  metadataURI: string;
}

export interface CreateReceivableInput {
  invoiceNumber: string;
  buyer: Address;
  amount: Amount;
  dueDate: Timestamp;
  invoiceHash: Hash;
}

export interface GrantSessionInput {
  key: Address;
  label?: string;
  payees: Address[];
  perTxCap: Amount;
  totalCap: Amount;
  expiresAt: Timestamp;
}

export interface PayInput {
  /** Omit to pay as the vendor owner. */
  sessionKey?: Address;
  payee: Address;
  amount: Amount;
  memo: string;
}

/** "fresh" = before step 1 · "scenario" = steps 1–10 + INV-002 awaiting the lab · "complete" = all 12 steps + INV-002. */
export type DemoPreset = "fresh" | "scenario" | "complete";
