"use client";

import { ReactNode } from "react";
import { WalletProvider } from "./wallet-provider";

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  return <WalletProvider>{children}</WalletProvider>;
}

