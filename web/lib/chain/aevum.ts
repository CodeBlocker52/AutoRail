import { defineChain } from "viem";

export const AEVUM_CHAIN_ID = 44005;
export const AEVUM_RPC_URL = process.env.NEXT_PUBLIC_AEVUM_RPC_URL || "https://rpc-test.qday.info";
export const AEVUM_EXPLORER_URL = "https://explorer-test.qday.info";
/** Aevum has no reliable WebSocket endpoint: everything polls over HTTP. */
export const POLL_INTERVAL_MS = 4_000;
/** Max block span per eth_getLogs request on Aevum. */
export const LOG_CHUNK_SIZE = 1_000n;

export const aevumTestnet = defineChain({
  id: AEVUM_CHAIN_ID,
  name: "QDay Aevum Testnet",
  nativeCurrency: { name: "tQDAY", symbol: "tQDAY", decimals: 18 },
  rpcUrls: { default: { http: [AEVUM_RPC_URL] } },
  blockExplorers: { default: { name: "Aevum Explorer", url: AEVUM_EXPLORER_URL } },
  testnet: true,
});

export const explorerTx = (hash: string) => `${AEVUM_EXPLORER_URL}/tx/${hash}`;
export const explorerAddress = (addr: string) => `${AEVUM_EXPLORER_URL}/address/${addr}`;
export const explorerBlock = (block: number | bigint) => `${AEVUM_EXPLORER_URL}/block/${block}`;
