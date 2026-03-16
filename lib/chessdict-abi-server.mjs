// Minimal ABI fragment for server-side settlement (ESM-compatible)
// Only includes the setWinnerSingle function needed by the redeemer wallet.
export const setWinnerSingleAbi = [
  {
    type: "function",
    name: "setWinnerSingle",
    inputs: [
      { name: "_gameId", type: "uint256", internalType: "uint256" },
      { name: "winner", type: "address", internalType: "address" },
      { name: "isDraw", type: "bool", internalType: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
];
