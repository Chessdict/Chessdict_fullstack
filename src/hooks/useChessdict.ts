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
import { parseUnits, decodeEventLog } from "viem";
import { baseSepolia, base } from "viem/chains";
import { useState, useCallback } from "react";
import { toast } from "sonner";

const TARGET_CHAIN = CHESSDICT_CHAIN_ID === baseSepolia.id ? baseSepolia : base;

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
      toast.info(`Switching to ${TARGET_CHAIN.name}…`);
      try {
        await switchChain({ chainId: CHESSDICT_CHAIN_ID });
      } catch (err: any) {
        // 4902 = chain not added to wallet — add it first, then switch
        if (err?.code === 4902 || err?.cause?.code === 4902) {
          const provider = (window as any).ethereum;
          if (provider) {
            await provider.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: `0x${CHESSDICT_CHAIN_ID.toString(16)}`,
                chainName: TARGET_CHAIN.name,
                nativeCurrency: TARGET_CHAIN.nativeCurrency,
                rpcUrls: [TARGET_CHAIN.rpcUrls.default.http[0]],
                blockExplorerUrls: TARGET_CHAIN.blockExplorers
                  ? [TARGET_CHAIN.blockExplorers.default.url]
                  : [],
              }],
            });
            // Retry switch after adding
            await switchChain({ chainId: CHESSDICT_CHAIN_ID });
          }
        } else {
          throw err;
        }
      }
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
        gas: BigInt(100_000),
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
    ): Promise<{ success: boolean; onChainGameId?: string }> => {
      if (!address) {
        toast.error("Please connect your wallet first");
        return { success: false };
      }
      try {
        setIsLoading(true);
        await ensureNetwork();
        const stakeWei = parseUnits(stakeAmount, decimals);
        await approveToken(tokenAddress, stakeWei);
        toast.info("Step 2/2: Creating game on-chain…");
        const hash = await writeContractAsync({
          address: CHESSDICT_ADDRESS,
          abi: chessdictAbi,
          functionName: "createGameSingle",
          args: [tokenAddress, stakeWei],
          chainId: CHESSDICT_CHAIN_ID,
          gas: BigInt(300_000),
        });
        const receipt = await publicClient?.waitForTransactionReceipt({ hash });
        toast.success("Transaction confirmed!");

        // Parse GameSingleCreated event from receipt to get onChainGameId
        let onChainGameId: string | undefined;
        if (receipt?.logs) {
          for (const log of receipt.logs) {
            try {
              const decoded = decodeEventLog({
                abi: chessdictAbi,
                data: log.data,
                topics: log.topics,
              });
              if (decoded.eventName === "GameSingleCreated") {
                onChainGameId = String((decoded.args as any).gameId);
                break;
              }
            } catch {
              // not our event, skip
            }
          }
        }

        return { success: true, onChainGameId };
      } catch (err: any) {
        toast.error(err?.shortMessage ?? err?.message ?? "Transaction failed");
        return { success: false };
      } finally {
        setIsLoading(false);
      }
    },
    [address, ensureNetwork, approveToken, publicClient, writeContractAsync],
  );

  const joinGameSingle = useCallback(
    async (
      gameId: bigint,
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
            functionName: "joinGameSingle",
            args: [gameId],
            chainId: CHESSDICT_CHAIN_ID,
            gas: BigInt(300_000),
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
            gas: BigInt(200_000),
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
            gas: BigInt(200_000),
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
