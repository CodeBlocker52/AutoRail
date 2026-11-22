import "server-only";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  encodeFunctionData,
  http,
  keccak256,
  type Abi,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { POLL_INTERVAL_MS, TARGET_CHAIN_ID, targetChain } from "@/lib/chain/aevum";
import { DEPLOYMENTS } from "@/lib/autorail/generated/deployments";
import * as abis from "@/lib/autorail/generated/abis";
import { decodeRevertData } from "@/lib/autorail/errors";
import { withRetry } from "@/lib/autorail/indexer";
import { log } from "./log";
import { store } from "./store";

export function deployment() {
  const d = (DEPLOYMENTS as unknown as Record<number, (typeof DEPLOYMENTS)[44005]>)[TARGET_CHAIN_ID];
  if (!d) throw new Error(`no deployment for chain ${TARGET_CHAIN_ID} (run web/scripts/sync-deployments.mjs)`);
  return d;
}

let pc: PublicClient | null = null;
export function publicClient(): PublicClient {
  pc ??= createPublicClient({
    chain: targetChain,
    transport: http(process.env.AUTORAIL_RPC_URL || targetChain.rpcUrls.default.http[0], { retryCount: 0 }),
    pollingInterval: POLL_INTERVAL_MS,
  }) as PublicClient;
  return pc;
}

const ALL_ERRORS = Object.values(abis)
  .flat()
  .filter((x) => (x as { type: string }).type === "error") as unknown as Abi;

/**
 * Nonce manager that is safe across serverless instances: each send for a signer runs under a short Upstash lock
 * (`SET NX EX`), and the next nonce is max(node "pending" count, last nonce we used + 1, kept in the store). On
 * any broadcast failure the stored value is dropped and the next send resyncs from the node.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withSignerLock<T>(address: Address, fn: () => Promise<T>): Promise<T> {
  const key = `nonce-lock:${TARGET_CHAIN_ID}:${address.toLowerCase()}`;
  const deadline = Date.now() + 30_000;
  while (!(await store.claim(key, 20))) {
    if (Date.now() > deadline) throw new Error("signer busy: another request is sending from this wallet");
    await sleep(200 + Math.floor(Math.random() * 200));
  }
  try {
    return await fn();
  } finally {
    await store.del(key).catch(() => undefined);
  }
}
const nonceKey = (address: Address) => `nonce:${TARGET_CHAIN_ID}:${address.toLowerCase()}`;
async function nextNonce(client: PublicClient, address: Address) {
  const [pending, stored] = await Promise.all([
    withRetry(() => client.getTransactionCount({ address, blockTag: "pending" })),
    store.get<number>(nonceKey(address)),
  ]);
  return Math.max(pending, stored ?? 0);
}

export interface Call {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

export interface Sent {
  hash: Hash;
  status: "success" | "reverted";
  block: number;
  errorName?: string;
  errorArgs?: string[];
  receipt: TransactionReceipt;
}

/** Simulate a success-path call. Throws a viem error (decoded with every Autorail error) if it would revert. */
export async function simulate(from: PrivateKeyAccount, call: Call) {
  await withRetry(() =>
    publicClient().simulateContract({ ...call, abi: [...call.abi, ...ALL_ERRORS], args: call.args ?? [], account: from } as never),
  );
}

/** Decode why a call reverts (re-run at `block`, or latest). */
export async function revertReason(from: Address, call: Call, block?: bigint) {
  for (const blockNumber of block !== undefined ? [block, undefined] : [undefined]) {
    try {
      await publicClient().simulateContract({
        ...call,
        abi: [...call.abi, ...ALL_ERRORS],
        args: call.args ?? [],
        account: from,
        ...(blockNumber !== undefined ? { blockNumber } : {}),
      } as never);
    } catch (e) {
      if (e instanceof BaseError) {
        const rev = e.walk((x) => x instanceof ContractFunctionRevertedError);
        if (rev instanceof ContractFunctionRevertedError) {
          if (rev.data?.errorName) return { errorName: rev.data.errorName, errorArgs: (rev.data.args ?? []).map(String) };
          const raw = decodeRevertData(rev.raw);
          if (raw) return { errorName: raw.name, errorArgs: (raw.args ?? []).map(String) };
          if (rev.reason) return { errorName: rev.reason };
        }
      }
    }
  }
  return { errorName: "Unknown" };
}

/**
 * Sign locally, report the hash BEFORE broadcasting (callers persist it), broadcast with retries
 * (re-sending the same signed bytes is idempotent), then wait for the receipt and decode any revert.
 * `gas` set explicitly skips estimation: that's how blocked attempts become real mined reverts.
 */
export async function send(
  from: PrivateKeyAccount,
  call: Call,
  opts: { gas?: bigint; onHash?: (h: Hash) => void | Promise<void> } = {},
): Promise<Sent> {
  const data = encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args ?? [] } as never);
  const out = await broadcast(from, { to: call.address, data }, call.functionName, opts);
  if (out.status === "reverted") Object.assign(out, await revertReason(from.address, call, out.receipt.blockNumber - 1n));
  return out;
}

/** Plain tQDAY transfer (gas drip). */
export function sendValue(from: PrivateKeyAccount, to: Address, value: bigint) {
  return broadcast(from, { to, value }, "transfer", { gas: 21_000n });
}

async function broadcast(
  from: PrivateKeyAccount,
  tx: { to: Address; data?: Hex; value?: bigint },
  label: string,
  opts: { gas?: bigint; onHash?: (h: Hash) => void | Promise<void> },
): Promise<Sent> {
  const client = publicClient();
  const gas = opts.gas ?? ((await withRetry(() => client.estimateGas({ account: from, to: tx.to, data: tx.data, value: tx.value }))) * 12n) / 10n;
  const gasPrice = await withRetry(() => client.getGasPrice());
  const hash = await withSignerLock(from.address, async () => {
    const nonce = await nextNonce(client, from.address);
    const serialized = await from.signTransaction({ to: tx.to, data: tx.data, value: tx.value, gas, gasPrice, nonce, chainId: TARGET_CHAIN_ID, type: "legacy" });
    const h = keccak256(serialized);
    await opts.onHash?.(h);
    try {
      await withRetry(async () => {
        try {
          await client.sendRawTransaction({ serializedTransaction: serialized });
        } catch (e) {
          if (/already known|known transaction|already imported/i.test(String((e as Error).message))) return;
          throw e;
        }
      });
    } catch (e) {
      await store.del(nonceKey(from.address)).catch(() => undefined);
      throw e;
    }
    await store.set(nonceKey(from.address), nonce + 1, 600);
    return h;
  });
  const receipt = await withRetry(() => client.waitForTransactionReceipt({ hash, timeout: 120_000, pollingInterval: 1_500 }));
  const out: Sent = { hash, status: receipt.status, block: Number(receipt.blockNumber), receipt };
  log(receipt.status === "success" ? "info" : "warn", "tx", { fn: label, hash, status: receipt.status, block: out.block });
  return out;
}
