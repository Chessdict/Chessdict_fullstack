"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, usePublicClient, useSwitchChain, useChainId } from "wagmi";
import { chessdictAbi, CHESSDICT_ADDRESS, CHESSDICT_CHAIN_ID } from "@/lib/contract";
import { toast } from "sonner";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

function TokenRow({ token }: { token: `0x${string}` }) {
  const { data: isSupported } = useReadContract({
    address: CHESSDICT_ADDRESS,
    abi: chessdictAbi,
    functionName: "supportedTokens",
    args: [token],
    chainId: CHESSDICT_CHAIN_ID,
  });

  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-sm text-white">{token}</span>
        <span className="text-xs text-white/40">Base Mainnet USDC</span>
      </div>
      <span
        className={`rounded-full px-3 py-1 text-xs font-semibold ${
          isSupported ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
        }`}
      >
        {isSupported === undefined ? "…" : isSupported ? "Supported ✓" : "Not Supported ✗"}
      </span>
    </div>
  );
}

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: CHESSDICT_CHAIN_ID });
  const [customToken, setCustomToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { data: owner } = useReadContract({
    address: CHESSDICT_ADDRESS,
    abi: chessdictAbi,
    functionName: "owner",
    chainId: CHESSDICT_CHAIN_ID,
  });

  const { data: supportedTokens } = useReadContract({
    address: CHESSDICT_ADDRESS,
    abi: chessdictAbi,
    functionName: "getSupportedTokens",
    chainId: CHESSDICT_CHAIN_ID,
  });

  const isOwner =
    address && owner && address.toLowerCase() === (owner as string).toLowerCase();

  const addToken = async (tokenAddress: `0x${string}`) => {
    if (!isOwner) {
      toast.error("Only the contract owner can add tokens");
      return;
    }
    try {
      setIsLoading(true);
      if (chainId !== CHESSDICT_CHAIN_ID) {
        toast.info("Switching to Base Sepolia…");
        await switchChainAsync({ chainId: CHESSDICT_CHAIN_ID });
      }
      toast.info(`Adding token ${tokenAddress.slice(0, 8)}…`);
      const hash = await writeContractAsync({
        address: CHESSDICT_ADDRESS,
        abi: chessdictAbi,
        functionName: "addToken",
        args: [tokenAddress],
        chainId: CHESSDICT_CHAIN_ID,
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      toast.success("Token added successfully! ✓");
    } catch (err: any) {
      toast.error(err?.shortMessage ?? err?.message ?? "Transaction failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center bg-black pt-24 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-white/5 via-black to-black pointer-events-none" />
      <div className="relative w-full max-w-xl px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Contract Admin</h1>
          <p className="mt-1 text-sm text-white/40">Manage the Chessdict contract settings</p>
        </div>

        {/* Wallet */}
        <div className="mb-6">
          <ConnectButton />
        </div>

        {isConnected && (
          <div className="flex flex-col gap-4">
            {/* Owner Status */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="mb-1 text-xs text-white/40">Contract Owner</p>
              <p className="font-mono text-sm text-white">{owner as string ?? "Loading…"}</p>
              {address && (
                <p
                  className={`mt-2 text-xs font-semibold ${
                    isOwner ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {isOwner ? "✓ Your wallet is the contract owner" : "✗ Your wallet is NOT the owner"}
                </p>
              )}
            </div>

            {/* Supported Tokens */}
            <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="text-sm font-semibold text-white">Supported Tokens</h2>

              {/* Default USDC */}
              <TokenRow token={BASE_USDC} />

              {(supportedTokens as string[] | undefined)?.filter(
                (t) => t.toLowerCase() !== BASE_USDC.toLowerCase()
              ).map((t) => (
                <TokenRow key={t} token={t as `0x${string}`} />
              ))}
            </div>

            {/* Quick Add USDC */}
            {isOwner && (
              <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <h2 className="text-sm font-semibold text-white">Quick Add</h2>
                <button
                  disabled={isLoading}
                  onClick={() => addToken(BASE_USDC)}
                  className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                >
                  {isLoading ? "Adding…" : "Add Base Mainnet USDC"}
                </button>
              </div>
            )}

            {/* Custom Token */}
            {isOwner && (
              <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <h2 className="text-sm font-semibold text-white">Add Custom Token</h2>
                <input
                  type="text"
                  placeholder="0x… token address"
                  value={customToken}
                  onChange={(e) => setCustomToken(e.target.value)}
                  className="rounded-xl border border-white/10 bg-white/10 px-4 py-3 font-mono text-sm text-white outline-none placeholder:text-white/20"
                />
                <button
                  disabled={isLoading || !customToken.startsWith("0x") || customToken.length !== 42}
                  onClick={() => addToken(customToken as `0x${string}`)}
                  className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-40"
                >
                  {isLoading ? "Adding…" : "Add Token"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
