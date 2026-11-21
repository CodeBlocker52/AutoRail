import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet, rainbowWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http, type CreateConnectorFn, type Transport } from "wagmi";
import { POLL_INTERVAL_MS, targetChain } from "./chain/aevum";
import { testKeyAvailable, testKeyConnector } from "./testConnector";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

/** Injected wallets always work; WalletConnect-based wallets only when a project id is set. */
const walletConnectors = connectorsForWallets(
  [{ groupName: "Wallets", wallets: projectId ? [injectedWallet, metaMaskWallet, rainbowWallet, walletConnectWallet] : [injectedWallet] }],
  { appName: "Autorail", projectId: projectId || "autorail-local" },
);

/** The e2e test-key connector exists only on the local fork with a key injected by Playwright. */
const connectors: CreateConnectorFn[] = testKeyAvailable() ? [testKeyConnector(), ...walletConnectors] : walletConnectors;

export const wagmiConfig = createConfig({
  chains: [targetChain],
  connectors,
  transports: { [targetChain.id]: http(targetChain.rpcUrls.default.http[0]) } as Record<typeof targetChain.id, Transport>,
  pollingInterval: POLL_INTERVAL_MS, // Aevum: HTTP polling, no WebSockets
  ssr: true,
});
