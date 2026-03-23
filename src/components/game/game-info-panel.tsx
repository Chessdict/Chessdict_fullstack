"use client";

import { useEffect, useRef, useState, useCallback, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/stores/game-store";
import { cn } from "@/lib/utils";
import { useSocket } from "@/hooks/useSocket";
import { useAccount } from "wagmi";
import { ResignConfirmModal } from "./resign-confirm-modal";
import { getGameHistory } from "@/app/actions";
import { getMemojiForAddress } from "@/lib/memoji";
import { getTimeControlDisplay, getTimeControlMinutesFromSeconds } from "@/lib/time-control";
import { toast } from "sonner";

type ChatMessage = {
  sender: string;
  text: string;
  timestamp: number;
};

type GameHistoryEntry = {
  id: string;
  result: "win" | "loss" | "draw";
  playedAs: "white" | "black";
  opponentAddress: string;
  opponentRating: number;
  date: string;
};

interface GameInfoPanelProps {
  isSocketConnected: boolean;
}

export function GameInfoPanel({ isSocketConnected }: GameInfoPanelProps) {
  const router = useRouter();
  const {
    status,
    gameMode,
    player,
    opponent,
    playerColor,
    initialTime,
    moves,
    isOpponentConnected,
    roomId,
    setStatus,
    reset,
    stakeToken,
    stakeAmountRaw,
    gameResultModalDismissed,
    drawOfferSent,
    setDrawOfferSent,
    viewMoveIndex,
    setViewMoveIndex,
  } = useGameStore();

  const rejoinChatMessages = useGameStore((s) => s.rejoinChatMessages);
  const clearRejoinChatMessages = useGameStore((s) => s.clearRejoinChatMessages);

  const { address } = useAccount();
  const { socket } = useSocket(address ?? undefined);
  const [showResignModal, setShowResignModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"play" | "history">("play");
  const [activeSubTab, setActiveSubTab] = useState<"moves" | "info">("moves");

  // Game History state
  const [gameHistory, setGameHistory] = useState<GameHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const desktopChatContainerRef = useRef<HTMLDivElement>(null);
  const mobileChatContainerRef = useRef<HTMLDivElement>(null);

  const movesEndRef = useRef<HTMLDivElement>(null);
  const movesContainerRef = useRef<HTMLDivElement>(null);

  // Auto-play state: step forward one move at a time until reaching live position
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopAutoPlay = useCallback(() => {
    setIsAutoPlaying(false);
    if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
      autoPlayRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isAutoPlaying || viewMoveIndex === null) {
      stopAutoPlay();
      return;
    }
    autoPlayRef.current = setInterval(() => {
      const currentIndex = useGameStore.getState().viewMoveIndex;
      const totalMoves = useGameStore.getState().moves.length;
      if (currentIndex === null || currentIndex >= totalMoves - 1) {
        setViewMoveIndex(null);
        stopAutoPlay();
      } else {
        setViewMoveIndex(currentIndex + 1);
      }
    }, 600);
    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
        autoPlayRef.current = null;
      }
    };
  }, [isAutoPlaying, viewMoveIndex, setViewMoveIndex, stopAutoPlay]);

  // Handle resign action
  const handleResign = useCallback(() => {
    console.log("[INFO-PANEL] handleResign called");
    console.log("[INFO-PANEL] Emitting resign event:", { roomId, userId: address, socketConnected: socket?.connected });

    if (!socket) {
      console.error("[INFO-PANEL] Socket is not available!");
      return;
    }

    if (!roomId) {
      console.error("[INFO-PANEL] Room ID is not available!");
      return;
    }

    socket.emit("resign", { roomId, userId: address });
    console.log("[INFO-PANEL] Resign event emitted successfully");
    setShowResignModal(false);
  }, [socket, roomId, address]);

  // Fetch game history when tab is switched
  useEffect(() => {
    if (activeTab !== "history" || !address) return;
    let cancelled = false;
    setHistoryLoading(true);
    getGameHistory(address).then((res) => {
      if (cancelled) return;
      if (res.success && res.games) setGameHistory(res.games);
      setHistoryLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeTab, address]);

  const isWaitingForOpponent = status === "matched" || (status === "in-progress" && !opponent);
  const isGameActive = status === "in-progress";
  const isGameFinished = status === "finished";
  const canReviewGame = isGameActive || isGameFinished;
  const canPlayAgain = gameMode === "online" && !stakeToken && !stakeAmountRaw;
  const timeControlMinutes = getTimeControlMinutesFromSeconds(initialTime);
  const timeControlDisplay = getTimeControlDisplay(timeControlMinutes);

  // Chat socket listener
  useEffect(() => {
    if (!socket || !roomId) return;
    const handleChatMessage = (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg]);
      if (msg.sender !== address && !isMobileChatOpen) {
        setUnreadChatCount((prev) => prev + 1);
      }
    };
    socket.on("chatMessage", handleChatMessage);
    return () => { socket.off("chatMessage", handleChatMessage); };
  }, [socket, roomId, address, isMobileChatOpen]);

  // Auto-scroll chat inside chat containers only
  useEffect(() => {
    [desktopChatContainerRef.current, mobileChatContainerRef.current].forEach((container) => {
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    });
  }, [chatMessages, isMobileChatOpen]);

  useEffect(() => {
    if (isMobileChatOpen) {
      setUnreadChatCount(0);
    }
  }, [isMobileChatOpen]);

  useEffect(() => {
    if (!isGameActive) {
      setIsMobileChatOpen(false);
      setUnreadChatCount(0);
    }
  }, [isGameActive]);

  // Load chat messages from rejoin data (reconnection via store)
  useEffect(() => {
    if (rejoinChatMessages.length > 0) {
      setChatMessages(rejoinChatMessages);
      clearRejoinChatMessages();
    }
  }, [rejoinChatMessages, clearRejoinChatMessages]);

  // Direct socket listener for gameRejoined — restores chat even if the store
  // intermediate is missed due to race conditions during reconnection
  useEffect(() => {
    if (!socket) return;
    const handleGameRejoined = (data: { chatMessages?: ChatMessage[] }) => {
      if (data.chatMessages && data.chatMessages.length > 0) {
        setChatMessages(data.chatMessages);
      }
    };
    socket.on("gameRejoined", handleGameRejoined);
    return () => { socket.off("gameRejoined", handleGameRejoined); };
  }, [socket]);

  // Send chat message
  const sendChatMessage = useCallback(() => {
    if (!socket || !roomId || !chatInput.trim() || !address) return;
    const text = chatInput.trim();
    // Optimistic local add so sender sees their message immediately
    setChatMessages((prev) => [...prev, { sender: address, text, timestamp: Date.now() }]);
    socket.emit("chatMessage", { roomId, message: text });
    setChatInput("");
  }, [socket, roomId, chatInput, address]);

  const handleReviewGame = useCallback(() => {
    setActiveTab("play");
    setActiveSubTab("moves");
    stopAutoPlay();
    setViewMoveIndex(null);
  }, [setViewMoveIndex, stopAutoPlay]);

  const handlePlayNewGame = useCallback(() => {
    stopAutoPlay();
    if (socket && roomId) {
      socket.emit("leaveRoom", { roomId });
    }
    reset();
    router.push("/play");
  }, [reset, roomId, router, socket, stopAutoPlay]);

  const handlePlayAgain = useCallback(() => {
    if (!canPlayAgain) {
      handlePlayNewGame();
      return;
    }

    stopAutoPlay();
    if (socket && roomId) {
      socket.emit("leaveRoom", { roomId });
    }
    reset();
    toast.success("Finding a new match...");
    router.push(`/play?autoQueue=online&timeControl=${timeControlMinutes}`);
  }, [canPlayAgain, handlePlayNewGame, reset, roomId, router, socket, stopAutoPlay, timeControlMinutes]);

  // Clear chat only when switching to a genuinely different game
  const prevRoomIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (roomId && prevRoomIdRef.current && roomId !== prevRoomIdRef.current) {
      setChatMessages([]);
      setUnreadChatCount(0);
      setIsMobileChatOpen(false);
    }
    prevRoomIdRef.current = roomId;
  }, [roomId]);

  // Auto-scroll to latest move within the container only
  useEffect(() => {
    const container = movesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [moves]);

  // Group moves into pairs (white, black)
  const movePairs: { moveNumber: number; white?: (typeof moves)[0]; black?: (typeof moves)[0] }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1],
    });
  }

  const opponentName = opponent
    ? (gameMode === "computer" ? "Stockfish AI" : `${opponent.address.slice(0, 6)}...${opponent.address.slice(-4)}`)
    : "Opponent";
  const playerName = player ? `${player.address.slice(0, 6)}...${player.address.slice(-4)}` : "You";
  const playerMemoji = player?.memoji || (address ? getMemojiForAddress(address) : "/svgs/memoji/Frame 1000003460.svg");
  const opponentMemoji = opponent?.memoji || (opponent?.address ? getMemojiForAddress(opponent.address) : "/svgs/memoji/Frame 1000003461.svg");

  const pieceIcons: Record<string, string> = {
    p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚",
  };

  const renderChatThread = (containerRef: RefObject<HTMLDivElement | null>, maxHeightClass: string) => (
    <div
      ref={containerRef}
      className={cn("flex min-h-[96px] flex-col gap-3 overflow-y-auto elegant-scrollbar", maxHeightClass)}
    >
      {chatMessages.length === 0 ? (
        <p className="py-6 text-center text-[11px] text-white/20">No messages yet</p>
      ) : (
        chatMessages.map((msg, i) => {
          const isMe = msg.sender === address;
          const senderMemoji = isMe ? playerMemoji : opponentMemoji;
          return (
            <div key={`${msg.timestamp}-${i}`} className="flex">
              <div className="flex max-w-[85%] items-center gap-2 rounded-tl-[18px] rounded-tr-[18px] rounded-bl-[18px] rounded-br-[1px] bg-white/[0.08] p-1.5 pr-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/8">
                  <img src={senderMemoji} alt="" className="h-[30px] w-[30px] rounded-full object-contain" />
                </div>
                <span className="text-sm font-medium leading-snug text-white">{msg.text}</span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div className="flex flex-col rounded-[24px] border border-white/10 bg-[#1A1A1A]/90 backdrop-blur-xl overflow-hidden">
      {/* Top Tabs */}
      <div className="flex items-center border-b border-white/10 px-5 pt-3">
        {([
          { key: "play", label: "Play" },
          { key: "history", label: "Game History" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "px-3 py-2.5 text-sm font-medium transition-colors",
              activeTab === key
                ? "text-white border-b-2 border-white"
                : "text-white/40 hover:text-white/60"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ═══ GAME HISTORY TAB ═══ */}
      {activeTab === "history" && (
        <div className="flex flex-col gap-3 px-5 py-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">Recent Games</h3>
          {historyLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-blue-500 animate-spin" />
            </div>
          ) : gameHistory.length === 0 ? (
            <p className="text-center text-sm text-white/30 py-10">No completed games yet</p>
          ) : (
            <div className="flex flex-col gap-2 max-h-[450px] overflow-y-auto elegant-scrollbar">
              {gameHistory.map((g) => (
                <div
                  key={g.id}
                  className={cn(
                    "flex items-center justify-between rounded-xl p-3 border",
                    g.result === "win"
                      ? "bg-green-500/5 border-green-500/15"
                      : g.result === "loss"
                        ? "bg-red-500/5 border-red-500/15"
                        : "bg-yellow-500/5 border-yellow-500/15"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      "h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold",
                      g.result === "win" ? "bg-green-500/20 text-green-400" :
                      g.result === "loss" ? "bg-red-500/20 text-red-400" :
                      "bg-yellow-500/20 text-yellow-400"
                    )}>
                      {g.result === "win" ? "W" : g.result === "loss" ? "L" : "D"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        vs {g.opponentAddress.slice(0, 6)}...{g.opponentAddress.slice(-4)}
                      </p>
                      <p className="text-[11px] text-white/40">
                        Played as {g.playedAs} &middot; {new Date(g.date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-xs text-white/50 font-mono">{g.opponentRating}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ PLAY TAB ═══ */}
      {activeTab === "play" && (
        <div className="flex flex-col gap-4 px-5 py-4">
          {/* Sub-tabs: Game moves | Info */}
          <div className="flex rounded-full bg-white/5 p-1">
            <button
              onClick={() => setActiveSubTab("moves")}
              className={cn(
                "flex-1 rounded-full py-3.5 text-sm font-medium transition-colors",
                activeSubTab === "moves"
                  ? "bg-white text-black"
                  : "text-white/80 hover:text-white/100"
              )}
            >
              Game moves
            </button>
            <button
              onClick={() => setActiveSubTab("info")}
              className={cn(
                "flex-1 rounded-full py-3.5 text-sm font-medium transition-colors",
                activeSubTab === "info"
                  ? "bg-white text-black"
                  : "text-white/80 hover:text-white/100"
              )}
            >
              Info
            </button>
          </div>

          {/* Opening Name */}
          {isGameFinished && gameResultModalDismissed && (
            <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Game Complete</h3>
                <p className="mt-1 text-xs text-white/45">
                  Review the game, queue another match, or return to the lobby.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={handlePlayAgain}
                  className="rounded-xl border border-emerald-300/30 bg-emerald-300/18 px-4 py-3 text-sm font-semibold text-emerald-50 backdrop-blur-md transition hover:bg-emerald-300/24"
                >
                  Play Again
                </button>
                <button
                  onClick={handleReviewGame}
                  className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-medium text-emerald-50/95 backdrop-blur-md transition hover:bg-emerald-300/16"
                >
                  Review Game
                </button>
                <button
                  onClick={handlePlayNewGame}
                  className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-medium text-emerald-50/80 backdrop-blur-md transition hover:bg-emerald-300/16 hover:text-emerald-50"
                >
                  New Game
                </button>
              </div>
            </div>
          )}

          {canReviewGame && activeSubTab === "moves" && (
            <p className="text-xs font-medium text-white">{opponentName}&apos;s Opening</p>
          )}

          {/* Waiting State */}
          {activeSubTab === "moves" && isWaitingForOpponent && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <div className="relative">
                <div className="h-16 w-16 rounded-full border-4 border-white/10 border-t-blue-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-8 w-8 rounded-full bg-blue-500/20" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-white font-medium">Waiting for opponent...</p>
                <p className="text-sm text-white/40 mt-1">Game will start when both players are ready</p>
              </div>
            </div>
          )}

          {/* Players Info */}
          {activeSubTab === "info" && canReviewGame && opponent && (
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">Players</h3>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[11px] font-medium uppercase tracking-widest text-white/35">Time Control</p>
                <p className="mt-1 text-sm font-semibold text-white">{timeControlDisplay}</p>
              </div>

              {/* Opponent */}
              <div className="flex items-center justify-between rounded-xl bg-white/5 p-3">
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10 rounded-full bg-gradient-to-br from-red-500/20 to-transparent border border-white/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-white/60 uppercase">
                      {gameMode === "computer" ? "AI" : opponent.address.slice(2, 4)}
                    </span>
                    <div
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0A0A0A]",
                        gameMode === "computer" || isOpponentConnected ? "bg-green-500" : "bg-yellow-500"
                      )}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {gameMode === "computer" ? "Stockfish AI" : `${opponent.address.slice(0, 6)}...${opponent.address.slice(-4)}`}
                    </p>
                    <p className="text-xs text-white/40">
                      {playerColor === "white" ? "Black" : "White"} pieces
                    </p>
                  </div>
                </div>
                <span className="text-xs text-white/30">
                  {gameMode === "computer" || isOpponentConnected ? "Online" : "Connecting..."}
                </span>
              </div>

              {/* You */}
              <div className="flex items-center justify-between rounded-xl bg-blue-500/10 border border-blue-500/20 p-3">
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10 rounded-full bg-gradient-to-br from-blue-500/20 to-transparent border border-blue-500/30 flex items-center justify-center">
                    <span className="text-xs font-bold text-blue-400">YOU</span>
                    <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0A0A0A] bg-green-500 animate-pulse" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {player ? `${player.address.slice(0, 6)}...${player.address.slice(-4)}` : "You"}
                    </p>
                    <p className="text-xs text-blue-400">
                      {playerColor === "white" ? "White" : "Black"} pieces
                    </p>
                  </div>
                </div>
                <span className="text-xs text-green-400">Online</span>
              </div>
            </div>
          )}

          {/* Move History */}
          {activeSubTab === "moves" && canReviewGame && (
            <div className="flex flex-col gap-3">
              <div ref={movesContainerRef} className="max-h-[260px] overflow-y-auto elegant-scrollbar">
                {movePairs.length === 0 ? (
                  <p className="text-center text-sm text-white/30 py-8">No moves yet</p>
                ) : (
                  <div className="flex flex-col">
                    {movePairs.map((pair, idx) => (
                      <div
                        key={pair.moveNumber}
                        className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0"
                      >
                        <span className="w-6 text-sm text-white/30 font-mono shrink-0">{pair.moveNumber}.</span>
                        <button
                          onClick={() => setViewMoveIndex(idx * 2)}
                          className={cn(
                            "flex items-center gap-1.5 flex-1 min-w-0 rounded px-1 -mx-1 transition",
                            viewMoveIndex === idx * 2 ? "bg-blue-500/20" : "hover:bg-white/5"
                          )}
                        >
                          {pair.white && (
                            <>
                              <span className="text-white/50 text-lg leading-none">{pieceIcons[pair.white.piece]}</span>
                              <span className="text-sm font-medium text-white">{pair.white.san}</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => pair.black && setViewMoveIndex(idx * 2 + 1)}
                          className={cn(
                            "flex items-center gap-1.5 flex-1 min-w-0 rounded px-1 -mx-1 transition",
                            viewMoveIndex === idx * 2 + 1 ? "bg-blue-500/20" : "hover:bg-white/5"
                          )}
                        >
                          {pair.black && (
                            <>
                              <span className="text-white/50 text-lg leading-none">{pieceIcons[pair.black.piece]}</span>
                              <span className="text-sm font-medium text-white">{pair.black.san}</span>
                            </>
                          )}
                        </button>
                        <div className="flex flex-col gap-1 items-end shrink-0 w-20">
                          {pair.white && (
                            <div className="flex items-center gap-1.5">
                              <div className="h-1 w-10 rounded-full bg-white/10 overflow-hidden">
                                <div className="h-full rounded-full bg-white/40" style={{ width: `${Math.max(20, 100 - idx * 10)}%` }} />
                              </div>
                              <span className="text-[10px] text-white/40 font-mono tabular-nums">
                                {pair.black ? `${Math.round((pair.black.timestamp - pair.white.timestamp) / 1000)}s` : "..."}
                              </span>
                            </div>
                          )}
                          {pair.black && (
                            <div className="flex items-center gap-1.5">
                              <div className="h-1 w-10 rounded-full bg-white/10 overflow-hidden">
                                <div className="h-full rounded-full bg-white/20" style={{ width: `${Math.max(15, 80 - idx * 8)}%` }} />
                              </div>
                              <span className="text-[10px] text-white/40 font-mono tabular-nums">
                                {movePairs[idx + 1]?.white ? `${Math.round((movePairs[idx + 1].white!.timestamp - pair.black.timestamp) / 1000)}s` : "..."}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={movesEndRef} />
                  </div>
                )}
              </div>
              {/* Move Navigation Controls */}
              {moves.length > 0 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  {[
                    { icon: "/svgs/icons/double-back.svg", label: "First", onClick: () => { stopAutoPlay(); setViewMoveIndex(0); } },
                    { icon: "/svgs/icons/back.svg", label: "Prev", onClick: () => {
                      stopAutoPlay();
                      if (viewMoveIndex === null) setViewMoveIndex(moves.length - 2);
                      else if (viewMoveIndex > 0) setViewMoveIndex(viewMoveIndex - 1);
                    }},
                    { icon: "/svgs/icons/play.svg", label: "Play", onClick: () => {
                      if (isAutoPlaying) {
                        stopAutoPlay();
                      } else if (viewMoveIndex !== null) {
                        setIsAutoPlaying(true); 
                      } else {
                        // Already at live — do nothing
                      }
                    }},
                    { icon: "/svgs/icons/forward.svg", label: "Next", onClick: () => {
                      stopAutoPlay();
                      if (viewMoveIndex !== null && viewMoveIndex < moves.length - 1) setViewMoveIndex(viewMoveIndex + 1);
                      else setViewMoveIndex(null);
                    }},
                    { icon: "/svgs/icons/double-forward.svg", label: "Last", onClick: () => { stopAutoPlay(); setViewMoveIndex(null); } },
                  ].map(({ icon, label, onClick }) => (
                    <button
                      key={label}
                      onClick={onClick}
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white",
                        label === "Play" && isAutoPlaying && "bg-blue-500/20 border-blue-500/30 text-blue-400"
                      )}
                      title={label}
                    >
                      {label === "Play" && isAutoPlaying ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                          <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                        </svg>
                      ) : (
                        <img src={icon} alt={label} width={24} height={294} />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Chat Section */}
          {isGameActive && activeSubTab === "moves" && (
            <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
              <div className="px-1">
                <p className="text-xs font-bold uppercase tracking-wider text-white/60">New Game</p>
                <p className="text-[11px] text-white/40 mt-0.5">
                  {opponentName} VS {playerName} (You)
                </p>
              </div>
              <div className="hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.025))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:block">
                {renderChatThread(desktopChatContainerRef, "max-h-[150px]")}
                <div className="mt-4 rounded-[28px] border border-white/18 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-4 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      placeholder="Send message..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") sendChatMessage(); }}
                      className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/28"
                      disabled={!isGameActive || gameMode === "computer"}
                    />
                    <button
                      type="button"
                      onClick={sendChatMessage}
                      disabled={!isGameActive || gameMode === "computer" || !chatInput.trim()}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#757575] transition hover:scale-[1.02] disabled:opacity-50"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="7.5" />
                        <path d="M9 14c.7.7 1.6 1 3 1s2.3-.3 3-1" />
                        <circle cx="9.2" cy="10" r="0.8" fill="currentColor" stroke="none" />
                        <circle cx="14.8" cy="10" r="0.8" fill="currentColor" stroke="none" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              <div className="sm:hidden">
                <button
                  type="button"
                  onClick={() => setIsMobileChatOpen(true)}
                  className="flex w-full items-center justify-between rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">Chat</p>
                    <p className="text-xs text-white/40">
                      {chatMessages.length === 0 ? "No messages yet" : `${chatMessages.length} message${chatMessages.length === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadChatCount > 0 ? (
                      <span className="rounded-full bg-blue-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                        {unreadChatCount}
                      </span>
                    ) : null}
                    <span className="text-sm text-white/50">Open</span>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isGameActive && activeTab === "play" && activeSubTab === "moves" && isMobileChatOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setIsMobileChatOpen(false)}
            aria-label="Close chat"
          />
          <div className="relative z-10 flex max-h-[72vh] w-full flex-col rounded-t-[28px] border border-white/10 bg-[#111111] px-4 pb-4 pt-3 shadow-[0_-20px_60px_rgba(0,0,0,0.45)]">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/15" />
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Chat</p>
                <p className="text-xs text-white/40">{opponentName} vs {playerName}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileChatOpen(false)}
                className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70"
              >
                Close
              </button>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.025))] p-4">
              {renderChatThread(mobileChatContainerRef, "max-h-[40vh]")}
            </div>
            <div className="mt-3 rounded-[24px] border border-white/18 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-4 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Send message..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") sendChatMessage(); }}
                  className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/28"
                  disabled={!isGameActive || gameMode === "computer"}
                />
                <button
                  type="button"
                  onClick={sendChatMessage}
                  disabled={!isGameActive || gameMode === "computer" || !chatInput.trim()}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#757575] transition hover:scale-[1.02] disabled:opacity-50"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="7.5" />
                    <path d="M9 14c.7.7 1.6 1 3 1s2.3-.3 3-1" />
                    <circle cx="9.2" cy="10" r="0.8" fill="currentColor" stroke="none" />
                    <circle cx="14.8" cy="10" r="0.8" fill="currentColor" stroke="none" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resign Confirmation Modal */}
      <ResignConfirmModal
        isOpen={showResignModal}
        onConfirm={handleResign}
        onCancel={() => setShowResignModal(false)}
      />
    </div>
  );
}
