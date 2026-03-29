"use client";

import {
  useReadContract,
  useWriteContract,
  useAccount,
  useChainId,
  useSwitchChain,
  usePublicClient,
  useConnectors,
} from "wagmi";
import {
  chessdictAbi,
  CHESSDICT_ADDRESS,
  CHESSDICT_CHAIN_ID,
} from "@/lib/contract";
import { networkConfig } from "@/lib/network-config";
import { erc20Abi } from "@/lib/erc20-abi";
import { parseUnits, decodeEventLog } from "viem";
import { useState, useCallback } from "react";
import { toast } from "sonner";

const TARGET_CHAIN = networkConfig.chain;

function formatChainMismatchMessage(currentChainId: number | undefined) {
  const currentChain = currentChainId ?? "unknown";
  return `Wallet is on chain ${currentChain}. Chessdict requires chain ${CHESSDICT_CHAIN_ID} (${TARGET_CHAIN.name}).`;
}

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

export function useTokenAllowance(
  tokenAddress: `0x${string}` | null,
  ownerAddress: `0x${string}` | undefined,
) {
  return useReadContract({
    address: tokenAddress ?? undefined,
    abi: erc20Abi,
    functionName: "allowance",
    args:
      ownerAddress ? [ownerAddress, CHESSDICT_ADDRESS] : undefined,
    query: { enabled: !!tokenAddress && !!ownerAddress },
    chainId: CHESSDICT_CHAIN_ID,
  });
}

// ─── Write Hook ───────────────────────────────────────────────────────────────

/**
 * useChessdict — hook providing all write interactions with the Chessdict contract.
 *
 * Internal helpers:
 *  - `ensureNetwork`      — switches to the configured Chessdict chain if needed
 *  - `approveToken`       — ERC-20 approval with on-chain wait
 *  - `executeStakedWrite` — full approve → write → confirm flow
 *  - `executeWrite`       — simple write → confirm flow (no approval needed)
 */
export function useChessdict() {
  const { address, connector, status } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const connectors = useConnectors();
  const publicClient = usePublicClient({ chainId: CHESSDICT_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();

  const [isLoading, setIsLoading] = useState(false);

  const activeConnector =
    (connector
      ? connectors.find((item) => item.uid === connector.uid) ??
        connectors.find((item) => item.id === connector.id)
      : undefined) ?? connector;

  // ── Private helpers ─────────────────────────────────────────────────────────

  const requireWalletConnector = useCallback(() => {
    if (!address) {
      throw new Error("Please connect your wallet first");
    }

    if (status !== "connected") {
      throw new Error("Wallet is still reconnecting. Please wait a moment, then try again.");
    }

    if (
      !activeConnector ||
      typeof activeConnector.getChainId !== "function" ||
      typeof activeConnector.getAccounts !== "function"
    ) {
      throw new Error("Wallet connection is stale. Disconnect and reconnect your wallet.");
    }

    return activeConnector;
  }, [activeConnector, address, status]);

  const ensureNetwork = useCallback(async () => {
    const currentConnector = requireWalletConnector();

    if (chainId !== CHESSDICT_CHAIN_ID) {
      toast.info(`Switching to ${TARGET_CHAIN.name} (chain ${CHESSDICT_CHAIN_ID})…`);
      try {
        await switchChainAsync({
          chainId: CHESSDICT_CHAIN_ID,
          connector: currentConnector,
        });
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
            await switchChainAsync({
              chainId: CHESSDICT_CHAIN_ID,
              connector: currentConnector,
            });
          }
        } else {
          throw new Error(formatChainMismatchMessage(chainId));
        }
      }
    }

    const resolvedChainId = await currentConnector
      .getChainId?.()
      .catch(() => chainId);

    if (resolvedChainId !== CHESSDICT_CHAIN_ID) {
      throw new Error(formatChainMismatchMessage(resolvedChainId));
    }
  }, [chainId, requireWalletConnector, switchChainAsync]);

  const approveToken = useCallback(
    async (tokenAddress: `0x${string}`, amount: bigint) => {
      const currentConnector = requireWalletConnector();

      toast.info("Step 1/2: Approving token…");
      const hash = await writeContractAsync({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [CHESSDICT_ADDRESS, amount],
        chainId: CHESSDICT_CHAIN_ID,
        connector: currentConnector,
        gas: BigInt(100_000),
      });
      await publicClient?.waitForTransactionReceipt({ hash });
    },
    [publicClient, requireWalletConnector, writeContractAsync],
  );

  /** Check current allowance for the Chessdict contract. */
  const checkAllowance = useCallback(
    async (tokenAddress: `0x${string}`): Promise<bigint> => {
      if (!address || !publicClient) return BigInt(0);
      const allowance = await publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, CHESSDICT_ADDRESS],
      });
      return allowance as bigint;
    },
    [address, publicClient],
  );

  /**
   * Runs (approve if needed) → write → confirm.
   * Skips the approval step if the current allowance already covers the amount.
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

        const currentAllowance = await checkAllowance(tokenAddress);
        if (currentAllowance < amount) {
          await approveToken(tokenAddress, amount);
        } else {
          toast.info("Allowance sufficient — skipping approval");
        }

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
    [address, ensureNetwork, approveToken, checkAllowance, publicClient],
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

        const currentAllowance = await checkAllowance(tokenAddress);
        if (currentAllowance < stakeWei) {
          await approveToken(tokenAddress, stakeWei);
        } else {
          toast.info("Allowance sufficient — skipping approval");
        }

        toast.info("Creating game on-chain…");
        const currentConnector = requireWalletConnector();
        const hash = await writeContractAsync({
          address: CHESSDICT_ADDRESS,
          abi: chessdictAbi,
          functionName: "createGameSingle",
          args: [tokenAddress, stakeWei],
          chainId: CHESSDICT_CHAIN_ID,
          connector: currentConnector,
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
    [address, ensureNetwork, approveToken, checkAllowance, publicClient, requireWalletConnector, writeContractAsync],
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
            connector: requireWalletConnector(),
            gas: BigInt(300_000),
          }),
        "Step 2/2: Joining game on-chain…",
      );
    },
    [executeStakedWrite, requireWalletConnector, writeContractAsync],
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
            connector: requireWalletConnector(),
            gas: BigInt(200_000),
          }),
        "Cancelling game…",
      );
    },
    [executeWrite, requireWalletConnector, writeContractAsync],
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
            connector: requireWalletConnector(),
            gas: BigInt(200_000),
          }),
        "Claiming prize…",
      );
    },
    [executeWrite, requireWalletConnector, writeContractAsync],
  );

  return {
    isLoading,
    checkAllowance,
    approveToken,
    ensureNetwork,
    createGameSingle,
    joinGameSingle,
    cancelGameSingle,
    claimPrizeSingle,
  };
}
