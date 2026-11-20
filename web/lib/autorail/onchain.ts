import { createPublicClient, http, type PublicClient, type WalletClient } from "viem";
import type { AutorailClient } from "./client";
import { AutorailError } from "./errors";
import { aevumTestnet, POLL_INTERVAL_MS } from "../chain/aevum";
import { TUSD8 } from "../config/contracts";
import { ERC20Permit3009Abi } from "../abi";
import type {
  ActivityEvent, Address, AdvanceOffer, Agent, Balances, DemoStep, JobWallet, LenderPosition, Payment,
  Receivable, Repayment, Role, Session, TypedDataPayload, VaultStats,
} from "./types";

const todo = (what: string): never => {
  throw new AutorailError("NotImplemented", `(${what})`);
};

/**
 * Onchain implementation (stub). Same interface as the mock; fill in each TODO once
 * the contracts are deployed and ABIs are pasted into lib/abi/.
 *
 * Notes for Aevum: poll over HTTP (no WebSockets), read logs in ≤1,000-block chunks,
 * and send legacy transactions if EIP-1559 is rejected.
 */
export class OnchainAutorailClient implements AutorailClient {
  readonly mode = "onchain" as const;
  private publicClient: PublicClient;
  private wallet?: WalletClient;

  constructor() {
    this.publicClient = createPublicClient({ chain: aevumTestnet, transport: http(), pollingInterval: POLL_INTERVAL_MS });
  }

  subscribe() {
    return () => {}; // react-query polls every POLL_INTERVAL_MS in onchain mode
  }
  setWalletClient(wallet: WalletClient | undefined) {
    this.wallet = wallet;
  }
  resolveActor(_role: Role, connected?: Address) {
    return connected;
  }

  // ── Reads ──
  async getBalances(account: Address): Promise<Balances> {
    const [tUSD8, tQDAY] = await Promise.all([
      this.publicClient.readContract({ address: TUSD8.address, abi: ERC20Permit3009Abi, functionName: "balanceOf", args: [account] }),
      this.publicClient.getBalance({ address: account }),
    ]);
    return { tUSD8, tQDAY };
  }
  async getVaultStats(): Promise<VaultStats> {
    // TODO(onchain): AutorailVault.totalAssets(), totalSupply(), totalOutstanding(); history from Deposit/Withdraw/Funded logs
    return { totalAssets: 0n, idle: 0n, outstanding: 0n, totalShares: 0n, repaidPrincipal: 0n, feesEarned: 0n, defaults: 0n, utilizationBps: 0, estApyBps: 0, activeAdvances: 0, history: [] };
  }
  async getLenderPosition(_account: Address): Promise<LenderPosition> {
    // TODO(onchain): vault.balanceOf(account), convertToAssets(shares), maxWithdraw(account); deposited from Deposit logs
    return { shares: 0n, value: 0n, deposited: 0n, earned: 0n, maxWithdraw: 0n };
  }
  async getAgents(): Promise<Agent[]> {
    // TODO(onchain): IdentityRegistry Registered logs + tokenURI; ReputationRegistry feedback logs per agent
    return [];
  }
  async getReceivables(): Promise<Receivable[]> {
    // TODO(onchain): ReceivableRegistry ReceivableCreated/Confirmed/Funded/Repaid logs (chunked) → state
    return [];
  }
  async getReceivable(_id: number): Promise<Receivable | null> {
    // TODO(onchain): ReceivableRegistry.receivables(id)
    return null;
  }
  async getAdvanceOffer(_id: number): Promise<AdvanceOffer | null> {
    // TODO(onchain): fetch the underwriting agent's signed quote (HTTP) or CreditFacility.quote(id)
    return null;
  }
  async getJobWallet(_id: number): Promise<JobWallet | null> {
    // TODO(onchain): JobWalletFactory.walletOf(id) → JobWallet reads
    return null;
  }
  async getSessions(_jw: Address): Promise<Session[]> {
    // TODO(onchain): JobWallet SessionGranted/SessionRevoked logs + sessions(key)
    return [];
  }
  async getPayments(_jw: Address): Promise<Payment[]> {
    // TODO(onchain): JobWallet Paid logs. Blocked attempts come from the agent relayer's log (reverted txs emit no events).
    return [];
  }
  async getRepayment(_id: number): Promise<Repayment | null> {
    // TODO(onchain): RepaymentRouter Repaid log for id
    return null;
  }
  async getActivity(): Promise<ActivityEvent[]> {
    // TODO(onchain): merge all Autorail logs (chunked getLogs, ≤1,000 blocks) into ActivityEvent[]
    return [];
  }
  async getConfirmationTypedData(_id: number): Promise<TypedDataPayload> {
    return todo("getConfirmationTypedData");
  }
  async getPaymentTypedData(_id: number): Promise<TypedDataPayload> {
    return todo("getPaymentTypedData");
  }
  async getDemoSteps(): Promise<DemoStep[]> {
    return []; // TODO(onchain): demo runner drives the real agents via the backend script
  }

  // ── Writes ──
  async depositWithPermit(): Promise<never> { return todo("depositWithPermit: sign tUSD8 permit, then vault.depositWithPermit"); }
  async withdraw(): Promise<never> { return todo("withdraw: vault.withdraw(assets, receiver, owner)"); }
  async registerAgent(): Promise<never> { return todo("registerAgent: IdentityRegistry.register(metadataURI)"); }
  async createReceivable(): Promise<never> { return todo("createReceivable: ReceivableRegistry.create(invoiceHash, buyer, amount, dueDate)"); }
  async confirmReceivable(): Promise<never> { return todo("confirmReceivable: signTypedData(Confirmation) then ReceivableRegistry.confirm"); }
  async fundAdvance(): Promise<never> { return todo("fundAdvance: CreditFacility.fund(id, advanceBps, feeBps, underwriterSig)"); }
  async grantSession(): Promise<never> { return todo("grantSession: JobWallet.grantSession(key, expiry, perTxCap, totalCap, payees)"); }
  async revokeSession(): Promise<never> { return todo("revokeSession: JobWallet.revoke(key)"); }
  async pay(): Promise<never> { return todo("pay: JobWallet.pay(payee, amount, memo)"); }
  async payInvoice(): Promise<never> { return todo("payInvoice: signTypedData(ReceiveWithAuthorization) → relayer → RepaymentRouter.payWithAuthorization"); }
  async markOverdue(): Promise<never> { return todo("markOverdue: CreditFacility.markOverdue(id)"); }
  async runDemoStep(): Promise<never> { return todo("runDemoStep"); }
  async resetDemo(): Promise<void> { /* not applicable onchain */ }

  /** Used by writes once implemented. */
  protected requireWallet(): WalletClient {
    if (!this.wallet) throw new AutorailError("UserRejected", "Connect a wallet first.");
    return this.wallet;
  }
}
