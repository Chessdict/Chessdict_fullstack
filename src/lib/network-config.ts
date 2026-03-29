import { base, baseSepolia } from "wagmi/chains";

/**
 * Set NEXT_PUBLIC_NETWORK=mainnet  → Base Mainnet (default)
 * Set NEXT_PUBLIC_NETWORK=testnet  → Base Sepolia
 *
 * In .env:
 *   NEXT_PUBLIC_NETWORK=mainnet   # production
 *   NEXT_PUBLIC_NETWORK=testnet   # development / testing
 */
const isMainnet = process.env.NEXT_PUBLIC_NETWORK !== "testnet";

export const networkConfig = {
  isMainnet,

  // Wagmi chain object
  chain: isMainnet ? base : baseSepolia,
  chainId: isMainnet ? base.id : baseSepolia.id, // 8453 | 84532

  // Chessdict contract — same address on both networks
  chessdictAddress:
    "0xaBb21D8466df3753764CA84d51db0ed65e155Da9" as `0x${string}`,

  // Native USDC on each network
  usdcAddress: isMainnet
    ? ("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`) // Base Mainnet USDC
    : ("0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`), // Base Sepolia USDC

  // Human-readable label
  networkLabel: isMainnet ? "Base Mainnet" : "Base Sepolia",

  // Public RPC (used in forge scripts / server code)
  rpcUrl: isMainnet
    ? "https://mainnet.base.org"
    : "https://sepolia.base.org",
} as const;
