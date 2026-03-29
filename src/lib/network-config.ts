import { base } from "wagmi/chains";

export const networkConfig = {
  key: "mainnet",
  isMainnet: true,

  chain: base,
  chainId: 8453,

  // Chessdict contract
  chessdictAddress:
    "0xaBb21D8466df3753764CA84d51db0ed65e155Da9" as `0x${string}`,

  // Native USDC on Base Mainnet
  usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,

  networkLabel: "Base Mainnet",

  rpcUrl: "https://mainnet.base.org",
  blockExplorerUrl: "https://basescan.org",
} as const;
