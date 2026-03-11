"use client";

import {
  useReadContract,
  useWriteContract,
  useAccount,
  useChainId,
  useSwitchChain,
  usePublicClient,
} from "wagmi";
import {
  chessdictAbi,
  CHESSDICT_ADDRESS,
  CHESSDICT_CHAIN_ID,
} from "@/lib/contract";
import { erc20Abi } from "@/lib/erc20-abi";
import { parseUnits } from "viem";
import { useState, useCallback } from "react";
import { toast } from "sonner";

// ─── Shared Types ─────────────────────────────────────────────────────────────

export type GameSingle = {
  player1: `0x${string}`;
  player2: `0x${string}`;
  token: `0x${string}`;
  stake: bigint;
  winner: `0x${string}`;
  totalPrize: bigint;
  created: boolean;
  isActive: boolean;
};

// ─── Read Hooks ───────────────────────────────────────────────────────────────

export function useGetGameSingle(gameId: bigint | null) {
  return useReadContract({
    address: CHESSDICT_ADDRESS,
    abi: chessdictAbi,
    functionName: "getGameSingle",
    args: gameId !== null ? [gameId] : undefined,
    query: { enabled: gameId !== null },
    chainId: CHESSDICT_CHAIN_ID,
  });
}

export function useGetSupportedTokens() {
  return useReadContract({
    address: CHESSDICT_ADDRESS,
    abi: chessdictAbi,
    functionName: "getSupportedTokens",
    chainId: CHESSDICT_CHAIN_ID,
  });
}

export function useTokenSymbol(tokenAddress: `0x${string}` | null) {
  return useReadContract({
    address: tokenAddress ?? undefined,
    abi: erc20Abi,
    functionName: "symbol",
    query: { enabled: !!tokenAddress },
    chainId: CHESSDICT_CHAIN_ID,
  });
}

export function useTokenDecimals(tokenAddress: `0x${string}` | null) {
  return useReadContract({
    address: tokenAddress ?? undefined,
    abi: erc20Abi,
    functionName: "decimals",
    query: { enabled: !!tokenAddress },
    chainId: CHESSDICT_CHAIN_ID,
  });
}

export function useTokenBalance(
  tokenAddress: `0x${string}` | null,
  userAddress: `0x${string}` | undefined,
) {
  return useReadContract({
    address: tokenAddress ?? undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!tokenAddress && !!userAddress },
    chainId: CHESSDICT_CHAIN_ID,
  });
}

// ─── Write Hook ───────────────────────────────────────────────────────────────

/**
 * useChessdict — hook providing all write interactions with the Chessdict contract.
 *
 * Internal helpers:
 *  - `ensureNetwork`      — switches to Base Sepolia if needed
 *  - `approveToken`       — ERC-20 approval with on-chain wait
 *  - `executeStakedWrite` — full approve → write → confirm flow
 *  - `executeWrite`       — simple write → confirm flow (no approval needed)
 */
export function useChessdict() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: CHESSDICT_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();

  const [isLoading, setIsLoading] = useState(false);

  // ── Private helpers ─────────────────────────────────────────────────────────

  const ensureNetwork = useCallback(async () => {
    if (chainId !== CHESSDICT_CHAIN_ID) {
      toast.info("Switching to Base Sepolia…");
      await switchChain({ chainId: CHESSDICT_CHAIN_ID });
    }
  }, [chainId, switchChain]);

  const approveToken = useCallback(
    async (tokenAddress: `0x${string}`, amount: bigint) => {
      toast.info("Step 1/2: Approving token…");
      const hash = await writeContractAsync({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [CHESSDICT_ADDRESS, amount],
        chainId: CHESSDICT_CHAIN_ID,
      });
      await publicClient?.waitForTransactionReceipt({ hash });
    },
    [writeContractAsync, publicClient],
  );

  /**
   * Runs approve → write → confirm.
   * Used by any action that requires a token stake (create, join).
   */
  const executeStakedWrite = useCallback(
    async (
      tokenAddress: `0x${string}`,
      amount: bigint,
      writeFn: () => Promise<`0x${string}`>,
      label: string,
    ): Promise<boolean> => {
      if (!address) {
        toast.error("Please connect your wallet first");
        return false;
      }
      try {
        setIsLoading(true);
        await ensureNetwork();
        await approveToken(tokenAddress, amount);
        toast.info(label);
        const hash = await writeFn();
        await publicClient?.waitForTransactionReceipt({ hash });
        toast.success("Transaction confirmed!");
        return true;
      } catch (err: any) {
        toast.error(err?.shortMessage ?? err?.message ?? "Transaction failed");
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [address, ensureNetwork, approveToken, publicClient],
  );

  /**
   * Runs write → confirm (no approval required).
   * Used by cancel and claim prize actions.
   */
  const executeWrite = useCallback(
    async (
      writeFn: () => Promise<`0x${string}`>,
      label: string,
    ): Promise<boolean> => {
      if (!address) {
        toast.error("Please connect your wallet first");
        return false;
      }
      try {
        setIsLoading(true);
        await ensureNetwork();
        toast.info(label);
        const hash = await writeFn();
        await publicClient?.waitForTransactionReceipt({ hash });
        toast.success("Transaction confirmed!");
        return true;
      } catch (err: any) {
        toast.error(err?.shortMessage ?? err?.message ?? "Transaction failed");
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [address, ensureNetwork, publicClient],
  );

  // ── Public actions ──────────────────────────────────────────────────────────

  const createGameSingle = useCallback(
    async (
      tokenAddress: `0x${string}`,
      stakeAmount: string,
      decimals = 18,
    ): Promise<boolean> => {
      const stakeWei = parseUnits(stakeAmount, decimals);
      return executeStakedWrite(
        tokenAddress,
        stakeWei,
        () =>
          writeContractAsync({
            address: CHESSDICT_ADDRESS,
            abi: chessdictAbi,
            functionName: "createGameSingle",
            args: [tokenAddress, stakeWei],
            chainId: CHESSDICT_CHAIN_ID,
          }),
        "Step 2/2: Creating game on-chain…",
      );
    },
    [executeStakedWrite, writeContractAsync],
  );

  const joinGameSingle = useCallback(
    async (
      gameId: bigint,
      tokenAddress: `0x${string}`,
      stakeAmount: string,
      decimals = 18,
    ) => {
      const stakeWei = parseUnits(stakeAmount, decimals);
      await executeStakedWrite(
        tokenAddress,
        stakeWei,
        () =>
          writeContractAsync({
            address: CHESSDICT_ADDRESS,
            abi: chessdictAbi,
            functionName: "joinGameSingle",
            args: [gameId],
            chainId: CHESSDICT_CHAIN_ID,
          }),
        "Step 2/2: Joining game on-chain…",
      );
    },
    [executeStakedWrite, writeContractAsync],
  );

  const cancelGameSingle = useCallback(
    async (gameId: bigint) => {
      await executeWrite(
        () =>
          writeContractAsync({
            address: CHESSDICT_ADDRESS,
            abi: chessdictAbi,
            functionName: "cancelGameSingle",
            args: [gameId],
            chainId: CHESSDICT_CHAIN_ID,
          }),
        "Cancelling game…",
      );
    },
    [executeWrite, writeContractAsync],
  );

  const claimPrizeSingle = useCallback(
    async (gameId: bigint) => {
      await executeWrite(
        () =>
          writeContractAsync({
            address: CHESSDICT_ADDRESS,
            abi: chessdictAbi,
            functionName: "claimPrizeSingle",
            args: [gameId],
            chainId: CHESSDICT_CHAIN_ID,
          }),
        "Claiming prize…",
      );
    },
    [executeWrite, writeContractAsync],
  );

  return {
    isLoading,
    createGameSingle,
    joinGameSingle,
    cancelGameSingle,
    claimPrizeSingle,
  };
}
