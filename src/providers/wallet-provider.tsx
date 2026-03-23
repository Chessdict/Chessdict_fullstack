"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { getDefaultConfig, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { ReactNode, useState } from "react";
import { networkConfig } from "@/lib/network-config";

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "4e8929e0682855581f1430d41829e205";

const config = getDefaultConfig({
  appName: "Chessdict",
  appDescription: "Play chess matches and optional staked games on Base.",
  appUrl: "https://chessdict.com",
  appIcon: "https://chessdict.com/logo.svg",
  projectId: walletConnectProjectId,
  // WalletConnect is more reliable when we advertise only the chain this app actually uses.
  chains: [networkConfig.chain],
  ssr: false,
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
