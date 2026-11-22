"use client";
import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { WagmiProvider, useAccount, useConnect, useWalletClient } from "wagmi";
import { testKeyAvailable } from "@/lib/testConnector";
import { wagmiConfig } from "@/lib/wagmi";
import { AUTORAIL_KEY, useClient } from "@/hooks/useClient";
import { RoleProvider } from "@/hooks/useRole";
import { ModeProvider } from "@/hooks/useMode";
import { ToastProvider } from "@/components/ui/Toast";

/** Re-fetch Autorail queries when the client reports a change; hand the wallet to the client. */
function AutorailBridge() {
  const client = useClient();
  const qc = useQueryClient();
  const { data: wallet } = useWalletClient();
  useEffect(
    () => client.subscribe(() => void qc.invalidateQueries({ queryKey: [AUTORAIL_KEY] })),
    [client, qc],
  );
  useEffect(() => client.setWalletClient(wallet ?? undefined), [client, wallet]);
  // e2e on the local fork only: connect the injected test key automatically
  const { connect, connectors } = useConnect();
  const { isConnected, chainId } = useAccount();
  useEffect(() => client.setConnectionState?.({ connected: isConnected, chainId }), [client, isConnected, chainId]);
  useEffect(() => {
    if (!isConnected && testKeyAvailable()) {
      const c = connectors.find((x) => x.id === "autorail-test-key");
      if (c) connect({ connector: c });
    }
  }, [isConnected, connectors, connect]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 2_000, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <ModeProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={qc}>
          <RainbowKitProvider
            theme={lightTheme({
              accentColor: "#1F4A3D",
              accentColorForeground: "white",
              borderRadius: "small",
              fontStack: "system",
            })}
            modalSize="compact"
          >
            <RoleProvider>
              <ToastProvider>
                <AutorailBridge />
                {children}
              </ToastProvider>
            </RoleProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ModeProvider>
  );
}
