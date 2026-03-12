"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useTournamentStore } from "@/stores/tournament-store";
import { type Socket } from "socket.io-client";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

interface TournamentGameBoardProps {
  socket: Socket | null;
  myAddress: string;
}

export function TournamentGameBoard({
  socket,
  myAddress,
}: TournamentGameBoardProps) {
  const {
    tournamentId,
    gameId,
    playerColor,
    opponentAddress,
    timeControl,
    whiteTime,
    blackTime,
    decrementWhiteTime,
    decrementBlackTime,
    setGameResult,
    setPhase,
    gameResult,
    disconnectedPlayers,
  } = useTournamentStore();

  const game = useMemo(() => new Chess(), []);
  const [fen, setFen] = useState(game.fen());
  const [moveSquares, setMoveSquares] = useState<
    Record<string, React.CSSProperties>
  >({});
  const [sourceSquare, setSourceSquare] = useState<string | null>(null);
  const [showResignConfirm, setShowResignConfirm] = useState(false);

  // Reset game when gameId changes
  useEffect(() => {
    game.reset();
    setFen(game.fen());
    setMoveSquares({});
    setSourceSquare(null);
    setShowResignConfirm(false);
  }, [gameId, game]);

  const syncState = useCallback(() => {
    setFen(game.fen());
  }, [game]);

  const safeMove = useCallback(
    (move: any) => {
      try {
        const result = game.move(move);
        if (result) {
          syncState();
          setMoveSquares({});
          setSourceSquare(null);
          return result;
        }
      } catch {
        // invalid move
      }
      return null;
    },
    [game, syncState],
  );

  // Timer countdown
  useEffect(() => {
    if (gameResult) return;
    if (!gameId) return;

    const turn = game.turn();
    const interval = setInterval(() => {
      if (turn === "w") decrementWhiteTime();
      else decrementBlackTime();
    }, 1000);

    return () => clearInterval(interval);
  }, [gameResult, gameId, fen, game, decrementWhiteTime, decrementBlackTime]);

  // Handle timeout
  useEffect(() => {
    if (gameResult) return;
    if (!gameId) return;

    const turn = game.turn();
    const timeLeft = turn === "w" ? whiteTime : blackTime;

    if (timeLeft <= 0) {
      const winner = turn === "w" ? "black" : "white";
      setGameResult(winner, "timeout");
      setPhase("round-waiting");

      if (socket && tournamentId && gameId) {
        socket.emit("tournament:gameComplete", {
          tournamentId,
          gameId,
          winner,
          isDraw: false,
        });
      }
    }
  }, [
    whiteTime,
    blackTime,
    gameResult,
    gameId,
    game,
    socket,
    tournamentId,
    setGameResult,
    setPhase,
  ]);

  // Listen for opponent moves
  useEffect(() => {
    if (!socket || !gameId) return;

    const handleOpponentMove = ({
      move,
    }: {
      gameId: string;
      move: any;
    }) => {
      safeMove(move);
    };

    socket.on("tournament:opponentMove", handleOpponentMove);
    return () => {
      socket.off("tournament:opponentMove", handleOpponentMove);
    };
  }, [socket, gameId, safeMove]);

  // Listen for force end
  useEffect(() => {
    if (!socket || !gameId) return;

    const handleForceEnd = () => {
      setGameResult("draw", "round_timeout");
      setPhase("round-waiting");
    };

    socket.on("tournament:forceEnd", handleForceEnd);
    return () => {
      socket.off("tournament:forceEnd", handleForceEnd);
    };
  }, [socket, gameId, setGameResult, setPhase]);

  // Check for checkmate/stalemate/draw
  useEffect(() => {
    if (gameResult) return;
    if (!game.isGameOver()) return;

    let winner: "white" | "black" | "draw" = "draw";
    let reason = "draw";

    if (game.isCheckmate()) {
      const loser = game.turn();
      winner = loser === "w" ? "black" : "white";
      reason = "checkmate";
    } else if (game.isStalemate()) {
      reason = "stalemate";
    }

    setGameResult(winner, reason);
    setPhase("round-waiting");

    if (socket && tournamentId && gameId) {
      socket.emit("tournament:gameComplete", {
        tournamentId,
        gameId,
        winner,
        isDraw: winner === "draw",
      });
    }
  }, [
    fen,
    gameResult,
    game,
    socket,
    tournamentId,
    gameId,
    setGameResult,
    setPhase,
  ]);

  // Move options highlighting
  const getMoveOptions = (square: string) => {
    const turn = game.turn();
    const piece = game.get(square as any);
    if (!piece || piece.color !== turn) return false;

    const myTurnCode = playerColor === "black" ? "b" : "w";
    if (piece.color !== myTurnCode) return false;

    const moves = game.moves({ square: square as any, verbose: true });
    if (moves.length === 0) {
      setMoveSquares({});
      return false;
    }

    const newSquares: Record<string, React.CSSProperties> = {};
    moves.forEach((move: any) => {
      const targetPiece = game.get(move.to);
      newSquares[move.to] = {
        background:
          targetPiece && targetPiece.color !== piece.color
            ? "radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)"
            : "radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)",
        borderRadius: "50%",
      };
    });
    newSquares[square] = { background: "rgba(255, 255, 0, 0.4)" };
    setMoveSquares(newSquares);
    return true;
  };

  const onSquareClick = ({ square }: { square: string }) => {
    if (gameResult) return;

    if (sourceSquare) {
      if (sourceSquare === square) {
        setSourceSquare(null);
        setMoveSquares({});
        return;
      }

      const moveData = { from: sourceSquare, to: square, promotion: "q" };
      try {
        const testResult = game.move(moveData);
        if (testResult) {
          game.undo();
          const result = safeMove(moveData);
          if (result && socket && gameId) {
            socket.emit("tournament:move", { gameId, move: moveData });
          }
          return;
        }
      } catch {
        // not valid
      }

      // Try selecting a different piece
      const piece = game.get(square as any);
      const myTurnCode = playerColor === "black" ? "b" : "w";
      if (piece && piece.color === myTurnCode) {
        setSourceSquare(square);
        getMoveOptions(square);
        return;
      }

      setSourceSquare(null);
      setMoveSquares({});
      return;
    }

    if (getMoveOptions(square)) {
      setSourceSquare(square);
    } else {
      setSourceSquare(null);
      setMoveSquares({});
    }
  };

  const onDrop = useCallback(
    (source: string, target: string) => {
      if (gameResult) return false;
      if (game.isGameOver()) return false;

      const turn = game.turn();
      const myTurnCode = playerColor === "black" ? "b" : "w";
      if (turn !== myTurnCode) return false;

      const moveData = { from: source, to: target, promotion: "q" };
      const result = safeMove(moveData);

      if (result && socket && gameId) {
        socket.emit("tournament:move", { gameId, move: moveData });
        return true;
      }
      return false;
    },
    [game, playerColor, socket, gameId, safeMove, gameResult],
  );

  const handleResign = () => {
    if (!socket || !tournamentId || !gameId) return;
    socket.emit("tournament:resign", { tournamentId, gameId });
    const winner = playerColor === "white" ? "black" : "white";
    setGameResult(winner, "resignation");
    setPhase("round-waiting");
    setShowResignConfirm(false);
  };

  const orientation: "white" | "black" =
    playerColor === "black" ? "black" : "white";
  const currentTurn = game.turn();
  const isMyTurn = currentTurn === (playerColor === "black" ? "b" : "w");

  // Opponent disconnect countdown
  const opponentDeadline = opponentAddress
    ? disconnectedPlayers[opponentAddress.toLowerCase()] ?? null
    : null;
  const [opponentCountdown, setOpponentCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (!opponentDeadline) {
      setOpponentCountdown(null);
      return;
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((opponentDeadline - Date.now()) / 1000));
      setOpponentCountdown(remaining);
    };
    update();
    const interval = setInterval(update, 200);
    return () => clearInterval(interval);
  }, [opponentDeadline]);

  return (
    <div className="flex flex-col gap-4">
      {/* Opponent timer + info */}
      <div className="flex items-center justify-between rounded-xl bg-[#0A0A0A]/60 p-4 backdrop-blur-xl border border-white/5 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-full bg-gradient-to-br from-red-500/20 to-transparent border border-white/10 ring-2 ring-red-500/20">
            <div className="h-full w-full flex items-center justify-center text-xs font-bold text-white/40 uppercase">
              {opponentAddress?.slice(2, 4) || "??"}
            </div>
          </div>
          <div>
            <div className="text-sm font-bold text-white tracking-tight">
              {opponentAddress
                ? `${opponentAddress.slice(0, 6)}...${opponentAddress.slice(-4)}`
                : "Waiting..."}
            </div>
            <div className="text-[10px] uppercase font-bold tracking-widest text-white/30">
              {!isMyTurn && !gameResult ? "Thinking..." : "Waiting"}
            </div>
          </div>
        </div>
        <div
          className={`text-xl font-mono tabular-nums px-3 py-1 rounded-lg border ${
            !isMyTurn && !gameResult
              ? "bg-red-500/20 border-red-500/30 text-red-400"
              : "bg-black/40 border-white/10 text-white/90"
          } ${(playerColor === "white" ? blackTime : whiteTime) <= 30 ? "animate-pulse" : ""}`}
        >
          {formatTime(playerColor === "white" ? blackTime : whiteTime)}
        </div>
      </div>

      {/* Opponent disconnected banner */}
      {opponentCountdown !== null && opponentCountdown > 0 && !gameResult && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 animate-pulse">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20 border border-amber-500/30">
            <svg className="h-4 w-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-300">Opponent disconnected</p>
            <p className="text-xs text-amber-400/60">
              Forfeit in{" "}
              <span className="font-mono font-bold text-amber-400 tabular-nums">
                {opponentCountdown}s
              </span>
              {" "}if they don&apos;t reconnect
            </p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/20 border border-amber-500/40">
            <span className="text-lg font-bold font-mono tabular-nums text-amber-400">
              {opponentCountdown}
            </span>
          </div>
        </div>
      )}

      {/* Chess Board */}
      <div className="relative group mx-auto w-full max-w-[min(720px,65vh)] aspect-square transition-transform duration-500">
        <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-xl blur-lg group-hover:opacity-100 opacity-50 transition-opacity" />
        <div className="relative h-full w-full overflow-hidden rounded-xl border border-white/10 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] bg-[#1a1816]">
          <Chessboard
            key={`tboard-${gameId}-${orientation}`}
            options={{
              position: fen,
              boardOrientation: orientation,
              allowDragging: !gameResult,
              boardStyle: { borderRadius: "4px" },
              darkSquareStyle: { backgroundColor: "#B58863" },
              lightSquareStyle: { backgroundColor: "#F0D9B5" },
              squareStyles: moveSquares,
              onSquareClick: onSquareClick,
              onPieceDrop: ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
                if (!sourceSquare || !targetSquare) return false;
                return onDrop(sourceSquare, targetSquare);
              },
            }}
          />
        </div>
      </div>

      {/* Player timer + info */}
      <div className="flex items-center justify-between rounded-xl bg-[#0A0A0A]/60 p-4 backdrop-blur-xl border border-white/5 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-full bg-gradient-to-br from-blue-500/20 to-transparent border border-blue-500/30 ring-2 ring-blue-500/20">
            <div className="h-full w-full flex items-center justify-center text-xs font-bold text-blue-400">
              YOU
            </div>
          </div>
          <div>
            <div className="text-sm font-bold text-white tracking-tight">
              {myAddress
                ? `${myAddress.slice(0, 6)}...${myAddress.slice(-4)}`
                : "You"}
            </div>
            <div className="text-[10px] uppercase font-bold tracking-widest text-blue-400/60">
              {isMyTurn && !gameResult ? "Your turn" : "Waiting"}
            </div>
          </div>
        </div>
        <div
          className={`text-xl font-mono tabular-nums px-3 py-1 rounded-lg border ${
            isMyTurn && !gameResult
              ? "bg-blue-500/20 border-blue-500/30 text-blue-400"
              : "bg-black/40 border-white/10 text-white/90"
          } ${(playerColor === "white" ? whiteTime : blackTime) <= 30 ? "animate-pulse" : ""}`}
        >
          {formatTime(playerColor === "white" ? whiteTime : blackTime)}
        </div>
      </div>

      {/* Resign button */}
      {!gameResult && (
        <div className="flex justify-center">
          {!showResignConfirm ? (
            <button
              onClick={() => setShowResignConfirm(true)}
              className="flex items-center gap-2 rounded-xl bg-red-500/10 px-6 py-2.5 text-sm font-medium text-red-400 transition hover:bg-red-500/20"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
                />
              </svg>
              Resign
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/60">Resign this game?</span>
              <button
                onClick={handleResign}
                className="rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/30"
              >
                Yes
              </button>
              <button
                onClick={() => setShowResignConfirm(false)}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white/60 transition hover:bg-white/20"
              >
                No
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
