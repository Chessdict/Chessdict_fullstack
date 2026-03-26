"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import { toast } from "sonner";
import { ConnectWallet } from "@/components/connect-wallet";
import { GlassBg } from "@/components/glass-bg";
import { GlassButton } from "@/components/glass-button";
import { cancelOpenChallenge, getOpenChallenge } from "@/app/actions";
import { MatchFoundModal } from "@/components/game/match-found-modal";
import { useChessdict, useTokenDecimals, useTokenSymbol } from "@/hooks/useChessdict";
import { useSocket } from "@/hooks/useSocket";
import { useGameStore } from "@/stores/game-store";
import { getMemojiForAddress } from "@/lib/memoji";
import { getTimeControlDisplay } from "@/lib/time-control";

type ChallengeDetails = {
  id: string;
  status: "OPEN" | "ACCEPTED" | "CANCELLED" | "EXPIRED";
  timeControl: number;
  staked: boolean;
  stakeToken: string | null;
  stakeAmount: string | null;
  roomId: string | null;
  gameStatus: "WAITING" | "IN_PROGRESS" | "COMPLETED" | "ABORTED" | "DRAW" | null;
  onChainGameId: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  creatorAddress: string;
  acceptedByAddress: string | null;
};

const POLL_INTERVAL_MS = 5000;
const INITIAL_LOAD_RETRY_MS = 1000;
const EXIT_REDIRECT_DELAY_MS = 1200;

export default function OpenChallengePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: challengeId } = use(params);
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { socket, isConnected: isSocketConnected } = useSocket(address ?? undefined);
  const { checkAllowance, approveToken, ensureNetwork } = useChessdict();
  const clearMatchState = useGameStore((s) => s.clearMatchState);
  const setGameMode = useGameStore((s) => s.setGameMode);

  const [challenge, setChallenge] = useState<ChallengeDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const hasNavigatedRef = useRef(false);
  const hasRedirectedRef = useRef(false);
  const retriedInitialLoadRef = useRef(false);
  const redirectTimeoutRef = useRef<number | null>(null);
  const challengeExpiryTimeoutRef = useRef<number | null>(null);
  const stakeTokenAddress =
    challenge?.staked && challenge.stakeToken
      ? (challenge.stakeToken as `0x${string}`)
      : null;
  const { data: stakeTokenSymbol } = useTokenSymbol(stakeTokenAddress);
  const { data: stakeTokenDecimals } = useTokenDecimals(stakeTokenAddress);

  const redirectToPlay = useCallback((message?: string) => {
    if (hasNavigatedRef.current || hasRedirectedRef.current) return;
    hasRedirectedRef.current = true;

    if (message) {
      toast.info(message);
    }

    if (redirectTimeoutRef.current) {
      window.clearTimeout(redirectTimeoutRef.current);
    }

    redirectTimeoutRef.current = window.setTimeout(() => {
      router.replace("/play");
    }, EXIT_REDIRECT_DELAY_MS);
  }, [router]);

  const loadChallenge = useCallback(
    async (options?: { silent?: boolean; allowRetry?: boolean }) => {
      if (!options?.silent) {
        setIsLoading(true);
      }

      try {
        const result = await getOpenChallenge(challengeId);
        if (!result.success || !result.challenge) {
          if (!options?.silent && options?.allowRetry !== false && !retriedInitialLoadRef.current) {
            retriedInitialLoadRef.current = true;
            window.setTimeout(() => {
              void loadChallenge({ allowRetry: false });
            }, INITIAL_LOAD_RETRY_MS);
            return;
          }

          if (!options?.silent) {
            const errorMessage = result.error ?? "Challenge not found";
            toast.error(errorMessage);
            setChallenge(null);
            redirectToPlay("Challenge link unavailable. Redirecting to play...");
          }
          return;
        }

        retriedInitialLoadRef.current = false;
        setChallenge(result.challenge);
      } catch (error) {
        console.error("Failed to load challenge:", error);
        if (!options?.silent && options?.allowRetry !== false && !retriedInitialLoadRef.current) {
          retriedInitialLoadRef.current = true;
          window.setTimeout(() => {
            void loadChallenge({ allowRetry: false });
          }, INITIAL_LOAD_RETRY_MS);
          return;
        }
        if (!options?.silent) {
          toast.error("Failed to load challenge");
          redirectToPlay("Challenge link could not be loaded. Redirecting to play...");
        }
      } finally {
        setIsLoading(false);
      }
    },
    [challengeId, redirectToPlay],
  );

  const navigateToGame = useCallback((roomId: string) => {
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    clearMatchState();
    setGameMode("friend");
    router.push(`/play/game/${roomId}`);
  }, [clearMatchState, router, setGameMode]);

  useEffect(() => {
    loadChallenge();
  }, [loadChallenge]);

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        window.clearTimeout(redirectTimeoutRef.current);
      }
      if (challengeExpiryTimeoutRef.current) {
        window.clearTimeout(challengeExpiryTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (
      !challenge ||
      !(
        challenge.status === "OPEN" ||
        (challenge.staked &&
          challenge.status === "ACCEPTED" &&
          challenge.gameStatus === "WAITING")
      )
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      loadChallenge({ silent: true });
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [challenge, loadChallenge]);

  useEffect(() => {
    if (challengeExpiryTimeoutRef.current) {
      window.clearTimeout(challengeExpiryTimeoutRef.current);
      challengeExpiryTimeoutRef.current = null;
    }

    if (!challenge || challenge.status !== "OPEN") return;

    const remainingMs = new Date(challenge.expiresAt).getTime() - Date.now();
    if (remainingMs <= 0) {
      setChallenge((current) =>
        current ? { ...current, status: "EXPIRED" } : current,
      );
      redirectToPlay("Challenge link expired. Redirecting to play...");
      return;
    }

    challengeExpiryTimeoutRef.current = window.setTimeout(() => {
      setChallenge((current) =>
        current ? { ...current, status: "EXPIRED" } : current,
      );
      redirectToPlay("Challenge link expired. Redirecting to play...");
    }, remainingMs);

    return () => {
      if (challengeExpiryTimeoutRef.current) {
        window.clearTimeout(challengeExpiryTimeoutRef.current);
        challengeExpiryTimeoutRef.current = null;
      }
    };
  }, [challenge, redirectToPlay]);

  useEffect(() => {
    if (!socket) return;

    const handleAccepted = (payload: {
      challengeId: string;
      roomId: string;
      staked?: boolean;
    }) => {
      if (payload.challengeId !== challengeId) return;
      setIsAccepting(false);
      if (payload.staked) {
        loadChallenge({ silent: true });
        return;
      }
      navigateToGame(payload.roomId);
    };

    const handleError = (payload: { challengeId?: string; error: string }) => {
      if (payload.challengeId && payload.challengeId !== challengeId) return;
      setIsAccepting(false);
      toast.error(payload.error);
      loadChallenge({ silent: true });
    };

    const handleGameReady = (payload: { roomId: string }) => {
      if (!challenge?.roomId || payload.roomId !== challenge.roomId) return;
      navigateToGame(payload.roomId);
    };

    socket.on("openChallengeAccepted", handleAccepted);
    socket.on("openChallengeError", handleError);
    socket.on("gameReady", handleGameReady);

    return () => {
      socket.off("openChallengeAccepted", handleAccepted);
      socket.off("openChallengeError", handleError);
      socket.off("gameReady", handleGameReady);
    };
  }, [challenge?.roomId, challengeId, loadChallenge, navigateToGame, socket]);

  useEffect(() => {
    if (!challenge?.roomId || challenge.status !== "ACCEPTED" || !address) return;

    const normalizedAddress = address.toLowerCase();
    if (
      challenge.creatorAddress.toLowerCase() === normalizedAddress ||
      challenge.acceptedByAddress?.toLowerCase() === normalizedAddress
    ) {
      if (!challenge.staked || challenge.gameStatus === "IN_PROGRESS") {
        navigateToGame(challenge.roomId);
      }
    }
  }, [address, challenge, navigateToGame]);

  const isCreator = useMemo(() => {
    if (!challenge || !address) return false;
    return challenge.creatorAddress.toLowerCase() === address.toLowerCase();
  }, [address, challenge]);

  const isAcceptedPlayer = useMemo(() => {
    if (!challenge || !address || !challenge.acceptedByAddress) return false;
    return challenge.acceptedByAddress.toLowerCase() === address.toLowerCase();
  }, [address, challenge]);

  const challengeUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/play/challenge/${challengeId}`;
  }, [challengeId]);

  const currentWallet = address?.toLowerCase() ?? null;
  const isChallengePlayer = useMemo(() => {
    if (!challenge || !currentWallet) return false;
    return (
      challenge.creatorAddress.toLowerCase() === currentWallet ||
      challenge.acceptedByAddress?.toLowerCase() === currentWallet
    );
  }, [challenge, currentWallet]);
  const shouldShowStakedSetup =
    !!challenge &&
    challenge.staked &&
    challenge.status === "ACCEPTED" &&
    challenge.roomId &&
    challenge.gameStatus === "WAITING" &&
    isChallengePlayer;
  const stakeTokenLabel = (stakeTokenSymbol as string) ?? "USDC";

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(challengeUrl);
      toast.success("Challenge link copied");
    } catch (error) {
      console.error("Failed to copy challenge link:", error);
      toast.error("Failed to copy challenge link");
    }
  };

  const handleAccept = async () => {
    if (!challenge) return;
    if (!isConnected || !address) {
      toast.error("Connect your wallet to accept the challenge");
      return;
    }

    if (!socket || !isSocketConnected) {
      toast.error("Socket not connected. Please try again.");
      return;
    }

    try {
      setIsAccepting(true);

      if (challenge.staked) {
        if (!stakeTokenAddress || !challenge.stakeAmount) {
          toast.error("This staked challenge is missing token details");
          setIsAccepting(false);
          return;
        }

        if (stakeTokenDecimals == null) {
          toast.error("Loading token info, please try again");
          setIsAccepting(false);
          return;
        }

        const stakeWei = parseUnits(challenge.stakeAmount, stakeTokenDecimals as number);
        const allowance = await checkAllowance(stakeTokenAddress);
        if (allowance < stakeWei) {
          toast.info("Approving token spend before joining the staked challenge…");
          await ensureNetwork();
          await approveToken(stakeTokenAddress, stakeWei);
          toast.success("Approval confirmed");
        }
      }

      socket.emit("acceptOpenChallenge", { challengeId });
    } catch (error: any) {
      console.error("Failed to accept open challenge:", error);
      setIsAccepting(false);
      toast.error(error?.shortMessage ?? error?.message ?? "Failed to accept challenge");
    }
  };

  const handleCancel = async () => {
    if (!challenge || !address) return;

    setIsCancelling(true);
    try {
      const result = await cancelOpenChallenge(challenge.id, address);
      if (!result.success || !result.challenge) {
        toast.error(result.error ?? "Failed to cancel challenge");
        return;
      }

      setChallenge(result.challenge);
      toast.success("Challenge cancelled");
    } catch (error) {
      console.error("Failed to cancel challenge:", error);
      toast.error("Failed to cancel challenge");
    } finally {
      setIsCancelling(false);
    }
  };

  const creatorMemoji = challenge ? getMemojiForAddress(challenge.creatorAddress) : null;
  const joinerMemoji = challenge?.acceptedByAddress
    ? getMemojiForAddress(challenge.acceptedByAddress)
    : null;

  return (
    <main className="flex min-h-screen flex-col bg-black text-white selection:bg-white/20">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-white/5 via-black to-black pointer-events-none" />

      <div className="container relative mx-auto flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-xl">
          <GlassBg className="p-6 sm:p-8" height="auto">
            {isLoading ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                <p className="text-sm text-white/60">Loading challenge…</p>
              </div>
            ) : !challenge ? (
              <div className="flex flex-col items-center gap-4 py-10 text-center">
                <h1 className="text-xl font-semibold text-white">Challenge unavailable</h1>
                <p className="max-w-sm text-sm text-white/55">
                  This challenge link could not be loaded. It may have expired or been removed.
                </p>
                <Link href="/play" className="text-sm text-green-300 hover:text-green-200">
                  Return to play
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {shouldShowStakedSetup ? (
                  <MatchFoundModal
                    opponent={
                      isCreator
                        ? (challenge.acceptedByAddress ?? "Opponent")
                        : challenge.creatorAddress
                    }
                    color={isCreator ? "white" : "black"}
                    staked
                    stakeToken={challenge.stakeToken}
                    stakeAmount={challenge.stakeAmount}
                    timeControl={challenge.timeControl}
                    roomId={challenge.roomId ?? undefined}
                    existingOnChainGameId={challenge.onChainGameId}
                    socket={socket}
                    onAccept={() => navigateToGame(challenge.roomId!)}
                    onDecline={() => {
                      loadChallenge({ silent: true });
                    }}
                  />
                ) : null}

                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="flex items-center gap-4">
                    <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5">
                      {creatorMemoji ? (
                        <Image src={creatorMemoji} alt="Creator" width={80} height={80} className="h-full w-full object-contain" />
                      ) : null}
                    </div>
                    <div className="text-2xl font-semibold text-white/70">VS</div>
                    <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5">
                      {joinerMemoji ? (
                        <Image src={joinerMemoji} alt="Joiner" width={80} height={80} className="h-full w-full object-contain" />
                      ) : (
                        <span className="text-xs uppercase tracking-[0.3em] text-white/35">Open</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h1 className="text-xl font-semibold text-white">Open challenge</h1>
                    <p className="mt-2 text-sm text-white/55">
                      {challenge.creatorAddress} created a {challenge.staked ? "staked" : "non-staked"} challenge link.
                    </p>
                    <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.3em] text-green-300/80">
                      {getTimeControlDisplay(challenge.timeControl)}
                    </p>
                    {challenge.staked && challenge.stakeAmount ? (
                      <p className="mt-2 text-xs font-medium text-green-300/80">
                        Stake: {challenge.stakeAmount} {stakeTokenLabel}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
                  <div className="flex items-center justify-between gap-4">
                    <span>Status</span>
                    <span className="font-medium text-white">{challenge.status}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <span>Expires</span>
                    <span className="font-medium text-white">
                      {new Date(challenge.expiresAt).toLocaleString()}
                    </span>
                  </div>
                  {challenge.acceptedByAddress ? (
                    <div className="mt-3 flex items-center justify-between gap-4">
                      <span>Accepted by</span>
                      <span className="font-medium text-white">{challenge.acceptedByAddress}</span>
                    </div>
                  ) : null}
                  {challenge.staked ? (
                    <div className="mt-3 flex items-center justify-between gap-4">
                      <span>Setup</span>
                      <span className="font-medium text-white">
                        {challenge.gameStatus === "WAITING"
                          ? "Waiting for both stake steps"
                          : challenge.gameStatus === "IN_PROGRESS"
                            ? "Ready"
                            : challenge.gameStatus ?? "Pending"}
                      </span>
                    </div>
                  ) : null}
                </div>

                {!isConnected ? (
                  <div className="flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-center">
                    <p className="text-sm text-white/60">
                      Connect a wallet to accept this challenge.
                    </p>
                    <ConnectWallet />
                  </div>
                ) : challenge.status === "OPEN" && isCreator ? (
                  <div className="flex flex-col gap-3">
                    <GlassButton className="w-full" onClick={handleCopyLink}>
                      Copy challenge link
                    </GlassButton>
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={isCancelling}
                      className="rounded-full border border-white/10 px-5 py-3 text-sm text-white/70 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCancelling ? "Cancelling…" : "Cancel challenge"}
                    </button>
                    <p className="text-center text-xs text-white/40">
                      {challenge.staked
                        ? "Share this link with a friend. The on-chain game is only created after they join and both of you complete the stake steps."
                        : "Share this link with a friend. When they accept, both of you will be taken into the game."}
                    </p>
                  </div>
                ) : challenge.status === "OPEN" ? (
                  <div className="flex flex-col gap-3">
                    <GlassButton className="w-full" onClick={handleAccept}>
                      {isAccepting
                        ? challenge.staked
                          ? "Preparing stake…"
                          : "Joining challenge…"
                        : challenge.staked
                          ? "Approve & accept challenge"
                          : "Accept challenge"}
                    </GlassButton>
                    <p className="text-center text-xs text-white/40">
                      {challenge.staked
                        ? "You may be asked to approve token spend for the Chessdict contract before the game is created."
                        : "This challenge is non-staked for now."}
                    </p>
                  </div>
                ) : challenge.status === "ACCEPTED" && (isCreator || isAcceptedPlayer) && challenge.roomId ? (
                  <div className="flex flex-col gap-3">
                    {challenge.staked && challenge.gameStatus === "ABORTED" ? (
                      <p className="text-center text-xs text-white/40">
                        This staked setup was cancelled before the game could start. Create a new link from the play page.
                      </p>
                    ) : challenge.staked && challenge.gameStatus !== "IN_PROGRESS" ? (
                      <p className="text-center text-xs text-white/40">
                        Finish the stake setup above to start the game.
                      </p>
                    ) : (
                      <>
                        <GlassButton className="w-full" onClick={() => navigateToGame(challenge.roomId!)}>
                          Enter game
                        </GlassButton>
                        <p className="text-center text-xs text-white/40">
                          Your game is ready.
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-center">
                    <p className="text-sm text-white/60">
                      {challenge.status === "CANCELLED"
                        ? "This challenge was cancelled by its creator."
                        : challenge.status === "EXPIRED"
                          ? "This challenge link has expired."
                          : challenge.staked && challenge.gameStatus === "ABORTED"
                            ? "This staked challenge setup was cancelled before the game could start."
                          : "This challenge has already been claimed."}
                    </p>
                    <Link href="/play" className="text-sm text-green-300 hover:text-green-200">
                      Return to play
                    </Link>
                  </div>
                )}
              </div>
            )}
          </GlassBg>
        </div>
      </div>
    </main>
  );
}
