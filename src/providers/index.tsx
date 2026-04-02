"use client";

import { ReactNode } from "react";
import { WalletProvider } from "./wallet-provider";
import { ActiveGameResumeListener } from "@/components/active-game-resume-listener";

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  return (
    <WalletProvider>
      <ActiveGameResumeListener />
      {children}
    </WalletProvider>
  );
}
