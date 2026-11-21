import type { Address } from "viem";
import { DEPLOYMENTS } from "@/lib/autorail/generated/deployments";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

/** tUSD8 on Aevum testnet: 6 decimals, EIP-2612 permit + EIP-3009. EIP-712 domain: name "tUSD8", version "2". */
export const TUSD8 = {
  address: "0x456569838f1d43009A91ebA4263147Afd7233483" as Address,
  symbol: "tUSD8",
  decimals: 6,
  eip712: { name: "tUSD8", version: "2" },
} as const;

/**
 * Autorail contract addresses come from the generated deployment (lib/autorail/generated/deployments.ts, written by
 * scripts/sync-deployments.mjs from contracts/deployments). There are no address env vars: one source of truth.
 */
const D = DEPLOYMENTS[44005].contracts;
export const CONTRACTS = {
  vault: D.vault as Address,
  receivableRegistry: D.registry as Address,
  creditFacility: D.facility as Address,
  jobWalletFactory: D.factory as Address,
  repaymentRouter: D.router as Address,
  identityRegistry: D.identity as Address,
  reputationRegistry: D.reputation as Address,
} as const;

export const isDeployed = (a: Address) => a !== ZERO;

/** True once the Autorail contracts are deployed on Aevum. Controls "live" wording on the landing page. */
export const DEPLOYED = process.env.NEXT_PUBLIC_DEPLOYED === "true";

/** Links used across the site. TODO: replace with the real repo / faucet URLs. */
export const SITE = {
  githubUrl: process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/CodeBlocker52/AutoRail",
  docsUrl: process.env.NEXT_PUBLIC_DOCS_URL || "https://github.com/CodeBlocker52/AutoRail#readme",
  faucetUrl: process.env.NEXT_PUBLIC_FAUCET_URL || "https://qday.info",
  explorerUrl: "https://explorer-test.qday.info",
} as const;
