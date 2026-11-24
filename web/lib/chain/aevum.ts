import { defineChain } from "viem";
import { currentMode } from "@/lib/autorail/mode";
// Chain definitions from Aevum Starter Kit's @aevum-kit/aevum (MIT, PQA Labs), vendored in lib/aevum-kit.
import { aevumFork, aevumTestnet as kitAevumTestnet, MAX_LOG_RANGE } from "@/lib/aevum-kit/chain";

export const AEVUM_CHAIN_ID = 44005;
export const AEVUM_FORK_CHAIN_ID = 440050;
export const AEVUM_RPC_URL = process.env.NEXT_PUBLIC_AEVUM_RPC_URL || "https://rpc-test.qday.info";
export const FORK_RPC_URL = process.env.NEXT_PUBLIC_FORK_RPC_URL || "http://127.0.0.1:8555";
export const AEVUM_EXPLORER_URL = "https://explorer-test.qday.info";
/** Aevum has no reliable WebSocket endpoint: everything polls over HTTP. */
export const POLL_INTERVAL_MS = 4_000;
/** eth_getLogs on Aevum: toBlock − fromBlock ≤ 1000. */
export const LOG_CHUNK_SIZE = MAX_LOG_RANGE;

export const aevumTestnet = defineChain({
  ...kitAevumTestnet,
  rpcUrls: { default: { http: [AEVUM_RPC_URL] } },
});
export const aevumLocalFork = defineChain({
  ...aevumFork,
  rpcUrls: { default: { http: [FORK_RPC_URL] } },
});

/** The chain the app targets: 44005 (default) or 440050 (`make fork`, e2e tests). */
export const TARGET_CHAIN_ID = Number(process.env.NEXT_PUBLIC_AUTORAIL_CHAIN_ID || AEVUM_CHAIN_ID);
export const targetChain = TARGET_CHAIN_ID === AEVUM_FORK_CHAIN_ID ? aevumLocalFork : aevumTestnet;
export const isLiveAevum = TARGET_CHAIN_ID === AEVUM_CHAIN_ID;

/**
 * Explorer links exist only for real transactions on Aevum (Live mode, chain 44005). On the local fork (440050) or with
 * demo data the hashes aren't on any explorer, so these return null and the UI shows a copyable hash instead.
 */
export const hasExplorer = () => isLiveAevum && currentMode() === "onchain";
export const noExplorerLabel = () => (currentMode() === "onchain" ? "local fork, no explorer" : "demo data, no explorer");
export const explorerTx = (hash: string): string | null => (hasExplorer() ? `${AEVUM_EXPLORER_URL}/tx/${hash}` : null);
export const explorerAddress = (addr: string): string | null => (hasExplorer() ? `${AEVUM_EXPLORER_URL}/address/${addr}` : null);
export const explorerBlock = (block: number | bigint): string | null => (hasExplorer() ? `${AEVUM_EXPLORER_URL}/block/${block}` : null);
