import type { Address } from "viem";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const env = (v: string | undefined): Address => (v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : ZERO);

/** tUSD8 on Aevum testnet: 6 decimals, EIP-2612 permit + EIP-3009. EIP-712 domain: name "tUSD8", version "2". */
export const TUSD8 = {
  address: "0x456569838f1d43009A91ebA4263147Afd7233483" as Address,
  symbol: "tUSD8",
  decimals: 6,
  eip712: { name: "tUSD8", version: "2" },
} as const;

/** Autorail contract addresses. Placeholders (zero address) until deployment; set via NEXT_PUBLIC_* env vars. */
export const CONTRACTS = {
  vault: env(process.env.NEXT_PUBLIC_VAULT_ADDRESS),
  receivableRegistry: env(process.env.NEXT_PUBLIC_RECEIVABLE_REGISTRY_ADDRESS),
  creditFacility: env(process.env.NEXT_PUBLIC_CREDIT_FACILITY_ADDRESS),
  jobWalletFactory: env(process.env.NEXT_PUBLIC_JOB_WALLET_FACTORY_ADDRESS),
  repaymentRouter: env(process.env.NEXT_PUBLIC_REPAYMENT_ROUTER_ADDRESS),
  identityRegistry: env(process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS),
  reputationRegistry: env(process.env.NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS),
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
