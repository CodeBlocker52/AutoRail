/**
 * Shared plumbing for the Autorail e2e scripts: chain/clients, accounts, ABIs, a per-account nonce manager,
 * idempotent raw-transaction sending, retries, revert decoding and the resumable step-state file.
 *
 * Aevum rules applied here: legacy (type 0) txs, HTTPS polling only, logs in ≤1,000-block chunks.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  formatUnits,
  http,
  keccak256,
  toHex,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { aevumFork, aevumTestnet } from "./aevum-kit/chain";

// ─────────────────────────── config ───────────────────────────

export type NetworkName = "fork" | "aevum";

export function parseArgs(argv = process.argv.slice(2)) {
  const get = (k: string) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const network = (get("network") ?? "fork") as NetworkName;
  if (network !== "fork" && network !== "aevum") throw new Error("--network must be fork|aevum");
  return { network, fresh: argv.includes("--fresh"), recycle: argv.includes("--recycle"), argv };
}

export function chainFor(network: NetworkName) {
  if (network === "aevum") {
    const url = process.env.AEVUM_RPC_URL || aevumTestnet.rpcUrls.default.http[0];
    return { ...aevumTestnet, rpcUrls: { default: { http: [url] } } };
  }
  const url = process.env.FORK_RPC_URL || aevumFork.rpcUrls.default.http[0];
  return { ...aevumFork, rpcUrls: { default: { http: [url] } } };
}

export const POLL_MS = 2_000;
export const RECEIPT_TIMEOUT_MS = 180_000;
export const BLOCKED_GAS = 250_000n;

export function publicClientFor(network: NetworkName): PublicClient {
  const chain = chainFor(network);
  return createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0], { retryCount: 0 }), pollingInterval: POLL_MS });
}

export const demo = JSON.parse(readFileSync("config/demo.json", "utf8")) as Record<string, number | string>;
export const n = (k: string) => BigInt(demo[k] as number);

export function loadDeployment(chainId: number) {
  const p = `deployments/${chainId}.json`;
  if (!existsSync(p)) throw new Error(`${p} not found. Run the deploy + register-agents targets first.`);
  const d = JSON.parse(readFileSync(p, "utf8"));
  const addr = (name: string) => d.contracts[name].address as Address;
  return {
    raw: d,
    deployBlock: BigInt(d.deployBlock ?? 0),
    tUSD8: d.tUSD8 as Address,
    identity: addr("IdentityRegistry"),
    reputation: addr("ReputationRegistry"),
    roles: addr("AutorailRoles"),
    vault: addr("AutorailVault"),
    registry: addr("ReceivableRegistry"),
    factory: addr("JobWalletFactory"),
    facility: addr("CreditFacility"),
    router: addr("RepaymentRouter"),
    agents: d.agents as Record<string, number>,
  };
}
export type Deployment = ReturnType<typeof loadDeployment>;

// ─────────────────────────── ABIs ───────────────────────────

function abiOf(name: string): Abi {
  return JSON.parse(readFileSync(`deployments/abi/${name}.json`, "utf8")) as Abi;
}
export const abi = {
  vault: abiOf("AutorailVault"),
  registry: abiOf("ReceivableRegistry"),
  facility: abiOf("CreditFacility"),
  router: abiOf("RepaymentRouter"),
  jobWallet: abiOf("JobWallet"),
  factory: abiOf("JobWalletFactory"),
  roles: abiOf("AutorailRoles"),
  identity: abiOf("IdentityRegistry"),
  reputation: abiOf("ReputationRegistry"),
};
/** Every Autorail error, for decoding reverts from any contract. */
export const allErrors = Object.values(abi)
  .flat()
  .filter((x) => (x as { type: string }).type === "error") as Abi;

export const tusd8Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "DOMAIN_SEPARATOR", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "authorizationState", stateMutability: "view", inputs: [{ type: "address" }, { type: "bytes32" }], outputs: [{ type: "bool" }] },
] as const;

// ─────────────────────────── accounts ───────────────────────────

export interface Actor {
  name: string;
  account: PrivateKeyAccount;
  address: Address;
}

function key(varName: string): Hex {
  const raw = process.env[varName]?.trim();
  if (!raw) throw new Error(`${varName} is not set (contracts/.env)`);
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
}

export function actor(name: string, varName: string): Actor {
  const account = privateKeyToAccount(key(varName));
  return { name, account, address: account.address };
}

export function addressOf(varName: string): Address {
  const v = process.env[varName];
  if (v && /^0x[0-9a-fA-F]{40}$/.test(v)) return v as Address;
  return privateKeyToAccount(key(varName.replace(/_ADDRESS$/, "_PRIVATE_KEY"))).address;
}

// ─────────────────────────── retries ───────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE =
  /(fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|timed? ?out|429|502|503|504|header not found|request failed|Too Many Requests|HTTP request failed)/i;

export function isRevert(e: unknown): boolean {
  if (e instanceof BaseError && e.walk((x) => x instanceof ContractFunctionRevertedError)) return true;
  return /execution reverted|revert/i.test(String((e as Error)?.message ?? e));
}

/** Retry transient RPC failures with exponential backoff. Never retries a revert. */
export async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 6): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (isRevert(e) || i >= tries - 1 || !RETRYABLE.test(msg)) throw e;
      const wait = 1000 * 2 ** i;
      console.log(`   ↻ ${label}: transient RPC error, retry ${i + 1}/${tries - 1} in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

// ─────────────────────────── nonce manager ───────────────────────────

export class NonceManager {
  private next = new Map<string, number>();
  constructor(private client: PublicClient) {}

  async take(address: Address): Promise<number> {
    const k = address.toLowerCase();
    if (!this.next.has(k)) {
      const n = await withRetry("nonce", () => this.client.getTransactionCount({ address, blockTag: "pending" }));
      this.next.set(k, n);
    }
    const n = this.next.get(k)!;
    this.next.set(k, n + 1);
    return n;
  }

  reset(address: Address) {
    this.next.delete(address.toLowerCase());
  }
}

// ─────────────────────────── sending ───────────────────────────

export interface Call {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

export interface TxResult {
  hash: Hex;
  status: "success" | "reverted";
  block: bigint;
  gasUsed: bigint;
  gasPrice: bigint;
  errorName?: string;
  errorArgs?: readonly unknown[];
  receipt: TransactionReceipt;
}

export class Sender {
  gasSpentWei = 0n;
  constructor(
    private client: PublicClient,
    private chainId: number,
    private nonces: NonceManager,
  ) {}

  /** Simulate a success-path call; throws (decoded) if it would revert. */
  async simulate(from: Actor, call: Call) {
    await withRetry(`simulate ${call.functionName}`, () =>
      this.client.simulateContract({ ...call, args: call.args ?? [], account: from.account } as never),
    );
  }

  /**
   * Sign locally, persist the hash via `onHash` BEFORE broadcasting, then broadcast with retries. Re-broadcasting
   * the same signed bytes is idempotent ("already known"), so a retry can never double-spend.
   */
  async send(from: Actor, call: Call, opts: { gas?: bigint; onHash: (h: Hex) => void }): Promise<Hex> {
    const data = encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args ?? [] } as never);
    const gas =
      opts.gas ??
      ((await withRetry("estimateGas", () =>
        this.client.estimateGas({ account: from.account, to: call.address, data }),
      )) *
        12n) /
        10n;
    const gasPrice = await withRetry("gasPrice", () => this.client.getGasPrice());
    const nonce = await this.nonces.take(from.address);
    const serialized = await from.account.signTransaction({
      to: call.address,
      data,
      gas,
      gasPrice,
      nonce,
      chainId: this.chainId,
      type: "legacy",
    });
    const hash = keccak256(serialized);
    opts.onHash(hash);
    try {
      await withRetry(`broadcast ${call.functionName}`, async () => {
        try {
          await this.client.sendRawTransaction({ serializedTransaction: serialized });
        } catch (e) {
          if (/already known|known transaction|already imported/i.test(String((e as Error).message))) return;
          throw e;
        }
      });
    } catch (e) {
      this.nonces.reset(from.address);
      throw e;
    }
    return hash;
  }

  /** Wait for a receipt (polling); decode the custom error if it reverted. */
  async wait(hash: Hex, from?: Actor, call?: Call): Promise<TxResult> {
    const receipt = await withRetry("receipt", () =>
      this.client.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS, pollingInterval: POLL_MS }),
    );
    const gasPrice = receipt.effectiveGasPrice ?? 0n;
    this.gasSpentWei += receipt.gasUsed * gasPrice;
    const out: TxResult = { hash, status: receipt.status, block: receipt.blockNumber, gasUsed: receipt.gasUsed, gasPrice, receipt };
    if (receipt.status === "reverted" && from && call) Object.assign(out, await this.decodeRevert(from, call, receipt.blockNumber));
    return out;
  }

  /** Re-run the call with eth_call at the parent block (fallback: latest) and decode the custom error. */
  async decodeRevert(from: Actor, call: Call, block: bigint) {
    for (const blockNumber of [block - 1n, undefined]) {
      try {
        await this.client.simulateContract({
          ...call,
          abi: [...call.abi, ...allErrors],
          args: call.args ?? [],
          account: from.account,
          ...(blockNumber !== undefined ? { blockNumber } : {}),
        } as never);
      } catch (e) {
        if (e instanceof BaseError) {
          const rev = e.walk((x) => x instanceof ContractFunctionRevertedError);
          if (rev instanceof ContractFunctionRevertedError && rev.data?.errorName) {
            return { errorName: rev.data.errorName, errorArgs: rev.data.args };
          }
        }
      }
    }
    return { errorName: "Unknown" };
  }
}

// ─────────────────────────── EIP-712 helpers ───────────────────────────

export function domainSeparator(name: string, version: string, chainId: number, verifyingContract: Address): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [
        keccak256(toHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")),
        keccak256(toHex(name)),
        keccak256(toHex(version)),
        BigInt(chainId),
        verifyingContract,
      ],
    ),
  );
}

// ─────────────────────────── step-state file ───────────────────────────

export interface StepRecord {
  step: string;
  title: string;
  actor: string;
  action: string;
  amounts?: Record<string, string>;
  status: "pending" | "sent" | "done" | "reverted-as-expected" | "failed";
  txHashes: Hex[];
  pendingHash?: Hex;
  blocks?: string[];
  decodedError?: string;
  note?: string;
  time?: string;
  balancesAfter?: Record<string, string>;
  explorer?: string[];
}

export interface RunState {
  runId: string;
  network: NetworkName;
  chainId: number;
  startedAt: string;
  finishedAt?: string;
  receivableId?: Hex;
  invoiceHash?: Hex;
  jobWallet?: Address;
  gasSpentTqday?: string;
  steps: Record<string, StepRecord>;
}

export class StateFile {
  readonly path: string;
  state: RunState;
  constructor(chainId: number, network: NetworkName, fresh: boolean) {
    this.path = `deployments/demo-run-${chainId}.json`;
    if (fresh && existsSync(this.path)) {
      const archived = this.path.replace(".json", `.${Date.now()}.json`);
      renameSync(this.path, archived);
      console.log(`archived previous run → ${archived}`);
    }
    this.state = existsSync(this.path)
      ? (JSON.parse(readFileSync(this.path, "utf8")) as RunState)
      : { runId: `${Date.now()}`, network, chainId, startedAt: new Date().toISOString(), steps: {} };
    this.save();
  }
  save() {
    writeFileSync(this.path, JSON.stringify(this.state, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n");
  }
  get(step: string) {
    return this.state.steps[step];
  }
  put(rec: StepRecord) {
    this.state.steps[rec.step] = rec;
    this.save();
  }
}

export const fmt = (v: bigint, d = 6) => formatUnits(v, d);
export { sleep };
