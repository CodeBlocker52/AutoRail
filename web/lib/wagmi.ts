import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet, rainbowWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { aevumTestnet, AEVUM_RPC_URL, POLL_INTERVAL_MS } from "./chain/aevum";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

/** Injected wallets always work; WalletConnect-based wallets only when a project id is set. */
const connectors = connectorsForWallets(
  [{ groupName: "Wallets", wallets: projectId ? [injectedWallet, metaMaskWallet, rainbowWallet, walletConnectWallet] : [injectedWallet] }],
  { appName: "Autorail", projectId: projectId || "autorail-local" },
);

export const wagmiConfig = createConfig({
  chains: [aevumTestnet],
  connectors,
  transports: { [aevumTestnet.id]: http(AEVUM_RPC_URL) },
  pollingInterval: POLL_INTERVAL_MS, // Aevum: HTTP polling, no WebSockets
  ssr: true,
});
