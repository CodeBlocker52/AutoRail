"use client";
/**
 * E2E-only wallet: a local private-key account exposed as an EIP-1193 provider. The key is injected by Playwright
 * (`window.__AUTORAIL_TEST_KEY__` via addInitScript), never bundled and never NEXT_PUBLIC_. It is only enabled on
 * the local fork (chain 440050), so it can't touch Aevum.
 */
import { createConnector } from "wagmi";
import { createPublicClient, http, numberToHex, type Hex, type TypedDataDefinition } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AEVUM_FORK_CHAIN_ID, TARGET_CHAIN_ID, targetChain } from "./chain/aevum";

declare global {
  interface Window {
    __AUTORAIL_TEST_KEY__?: Hex;
    /** Drills: reject every signature / tx request like a user pressing "Reject" (EIP-1193 code 4001). */
    __AUTORAIL_TEST_REJECT__?: boolean;
    /** Drills: pretend the wallet is on another chain. */
    __AUTORAIL_TEST_CHAIN_ID__?: number;
    /** Drills: number of signature / tx prompts the wallet received. */
    __AUTORAIL_TEST_PROMPTS__?: number;
  }
}

const SIGNING = new Set(["personal_sign", "eth_signTypedData_v4", "eth_sendTransaction"]);
const walletChainId = () => window.__AUTORAIL_TEST_CHAIN_ID__ ?? TARGET_CHAIN_ID;

export const testKeyAvailable = () =>
  typeof window !== "undefined" && TARGET_CHAIN_ID === AEVUM_FORK_CHAIN_ID && /^0x[0-9a-fA-F]{64}$/.test(window.__AUTORAIL_TEST_KEY__ ?? "");

/** Typed-data JSON comes back with numbers as strings: restore bigints for (u)int fields. */
function reviveTyped(td: { types: Record<string, { name: string; type: string }[]>; primaryType: string; domain: Record<string, unknown>; message: Record<string, unknown> }) {
  const fix = (type: string, value: unknown): unknown => {
    if (type.endsWith("[]")) return (value as unknown[]).map((v) => fix(type.slice(0, -2), v));
    if (/^u?int\d*$/.test(type)) return BigInt(value as string);
    const fields = td.types[type];
    if (fields) return Object.fromEntries(fields.map((f) => [f.name, fix(f.type, (value as Record<string, unknown>)[f.name])]));
    return value;
  };
  const { EIP712Domain: _d, ...types } = td.types;
  void _d;
  const domain = { ...td.domain, ...(td.domain.chainId !== undefined ? { chainId: Number(td.domain.chainId) } : {}) };
  return { domain, types, primaryType: td.primaryType, message: fix(td.primaryType, td.message) } as unknown as TypedDataDefinition;
}

export function testKeyConnector() {
  return createConnector((config) => {
    let account: ReturnType<typeof privateKeyToAccount> | undefined;
    const pc = createPublicClient({ chain: targetChain, transport: http() });
    const acct = () => (account ??= privateKeyToAccount(window.__AUTORAIL_TEST_KEY__!));
    const provider = {
      async request({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> {
        const p = (params ?? []) as never[];
        if (SIGNING.has(method)) {
          window.__AUTORAIL_TEST_PROMPTS__ = (window.__AUTORAIL_TEST_PROMPTS__ ?? 0) + 1;
          if (window.__AUTORAIL_TEST_REJECT__) throw Object.assign(new Error("User rejected the request."), { code: 4001 });
        }
        switch (method) {
          case "eth_accounts":
          case "eth_requestAccounts":
            return [acct().address];
          case "eth_chainId":
            return numberToHex(walletChainId());
          case "wallet_switchEthereumChain":
            return null;
          case "personal_sign":
            return acct().signMessage({ message: { raw: p[0] as Hex } });
          case "eth_signTypedData_v4":
            return acct().signTypedData(reviveTyped(JSON.parse(p[1] as string)));
          case "eth_sendTransaction": {
            const tx = p[0] as { to: Hex; data?: Hex; value?: Hex; gas?: Hex; gasPrice?: Hex; nonce?: Hex };
            const a = acct();
            const nonce = tx.nonce ? Number(tx.nonce) : await pc.getTransactionCount({ address: a.address, blockTag: "pending" });
            const gas = tx.gas ? BigInt(tx.gas) : ((await pc.estimateGas({ account: a.address, to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n })) * 12n) / 10n;
            const gasPrice = tx.gasPrice ? BigInt(tx.gasPrice) : await pc.getGasPrice();
            const raw = await a.signTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n, gas, gasPrice, nonce, chainId: TARGET_CHAIN_ID, type: "legacy" });
            return pc.sendRawTransaction({ serializedTransaction: raw });
          }
          default:
            return pc.request({ method, params } as never);
        }
      },
      on() {},
      removeListener() {},
    };
    return {
      id: "autorail-test-key",
      name: "Test key (fork only)",
      type: "injected",
      async connect() {
        return { accounts: [acct().address], chainId: walletChainId() } as never;
      },
      async disconnect() {},
      async getAccounts() {
        return [acct().address];
      },
      async getChainId() {
        return walletChainId();
      },
      async getProvider() {
        return provider;
      },
      async isAuthorized() {
        return testKeyAvailable();
      },
      async switchChain() {
        return targetChain;
      },
      onAccountsChanged(accounts) {
        config.emitter.emit("change", { accounts: accounts as Hex[] });
      },
      onChainChanged() {},
      onDisconnect() {
        config.emitter.emit("disconnect");
      },
    };
  });
}
