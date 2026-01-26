"use client";

import { useAccount, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { GlassButton } from "./glass-button";

export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    const shortenedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
    return (
      <GlassButton onClick={() => disconnect()} className="text-xs sm:text-sm">
        {shortenedAddress}
      </GlassButton>
    );
  }

  return (
    <GlassButton onClick={openConnectModal} className="text-xs sm:text-sm">
      Connect wallet
    </GlassButton>
  );
}

