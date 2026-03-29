const MAINNET_CONFIG = Object.freeze({
  key: "mainnet",
  chainId: 8453,
  networkLabel: "Base Mainnet",
  rpcUrl: "https://mainnet.base.org",
  blockExplorerUrl: "https://basescan.org",
  usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
});

const TESTNET_CONFIG = Object.freeze({
  key: "testnet",
  chainId: 84532,
  networkLabel: "Base Sepolia",
  rpcUrl: "https://sepolia.base.org",
  blockExplorerUrl: "https://sepolia.basescan.org",
  usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
});

const NETWORKS = Object.freeze({
  mainnet: MAINNET_CONFIG,
  testnet: TESTNET_CONFIG,
});

const VALID_NETWORK_VALUES = Object.freeze(Object.keys(NETWORKS));

function formatExpectedValues() {
  return VALID_NETWORK_VALUES.map((value) => `"${value}"`).join(" or ");
}

export function resolvePublicNetwork(rawValue, source = "NEXT_PUBLIC_NETWORK") {
  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    throw new Error(
      `[NETWORK] Missing ${source}. Set it explicitly to ${formatExpectedValues()}.`,
    );
  }

  const normalizedValue = rawValue.trim().toLowerCase();
  const resolvedNetwork = NETWORKS[normalizedValue];

  if (!resolvedNetwork) {
    throw new Error(
      `[NETWORK] Invalid ${source}="${rawValue}". Expected ${formatExpectedValues()}.`,
    );
  }

  return resolvedNetwork;
}

export function assertMainnetInProduction(
  rawValue,
  {
    source = "NEXT_PUBLIC_NETWORK",
    nodeEnv = process.env.NODE_ENV,
  } = {},
) {
  const resolvedNetwork = resolvePublicNetwork(rawValue, source);

  if (nodeEnv === "production" && resolvedNetwork.key !== "mainnet") {
    throw new Error(
      `[NETWORK] Production must use ${source}="mainnet". Refusing to boot with "${rawValue}".`,
    );
  }

  return resolvedNetwork;
}

export function formatResolvedNetworkLog(resolvedNetwork, rpcUrl) {
  return `[NETWORK] ${resolvedNetwork.networkLabel} (chain ${resolvedNetwork.chainId}) via ${rpcUrl}`;
}

export { NETWORKS, VALID_NETWORK_VALUES };
