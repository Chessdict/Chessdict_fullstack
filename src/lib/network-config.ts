import { base, baseSepolia } from "wagmi/chains";
import { resolvePublicNetwork } from "../../lib/network-env.mjs";

const resolvedNetwork = resolvePublicNetwork(process.env.NEXT_PUBLIC_NETWORK);
const isMainnet = resolvedNetwork.key === "mainnet";

export const networkConfig = {
  key: resolvedNetwork.key,
  isMainnet,

  // This module is imported by client and server code, so invalid env must
  // explode here instead of silently drifting to Sepolia.
  chain: isMainnet ? base : baseSepolia,
  chainId: resolvedNetwork.chainId,

  // Chessdict contract — same address on both networks
  chessdictAddress:
    "0xaBb21D8466df3753764CA84d51db0ed65e155Da9" as `0x${string}`,

  usdcAddress: resolvedNetwork.usdcAddress as `0x${string}`,

  networkLabel: resolvedNetwork.networkLabel,

  rpcUrl: resolvedNetwork.rpcUrl,
  blockExplorerUrl: resolvedNetwork.blockExplorerUrl,
} as const;
