import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const prisma = new PrismaClient();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  const userSocketMap = new Map(); // userId -> socketId
  const activeGames = new Map(); // socketId -> roomId
  const matchmakingQueue = [];
  const recentlyCompletedGames = new Set(); // Track games that just ended to prevent false disconnect forfeits

  const checkForMatch = async () => {
    if (matchmakingQueue.length >= 2) {
      const p1 = matchmakingQueue.shift();
      const p2 = matchmakingQueue.shift();

      try {
        const whiteUser = await prisma.user.findUnique({ where: { walletAddress: p1.userId } });
        const blackUser = await prisma.user.findUnique({ where: { walletAddress: p2.userId } });

        if (whiteUser && blackUser) {
          const game = await prisma.game.create({
            data: {
              whitePlayerId: whiteUser.id,
              blackPlayerId: blackUser.id,
              fen: "start",
              status: "IN_PROGRESS",
            },
          });

          const roomId = game.id;

          // Emit match found to both players
          io.to(p1.socketId).emit("matchFound", {
            roomId,
            color: "white",
            opponent: p2.userId,
          });
          io.to(p2.socketId).emit("matchFound", {
            roomId,
            color: "black",
            opponent: p1.userId,
          });

          // Join rooms
          const s1 = io.sockets.sockets.get(p1.socketId);
          const s2 = io.sockets.sockets.get(p2.socketId);
          if (s1) {
            s1.join(roomId);
            activeGames.set(s1.id, roomId);
          }
          if (s2) {
            s2.join(roomId);
            activeGames.set(s2.id, roomId);
          }

          console.log(`Match found and persisted: ${p1.userId} vs ${p2.userId} in ${roomId}`);
        }
      } catch (error) {
        console.error("Error creating match in DB:", error);
      }
    }
  };

  io.on("connection", (socket) => {
    const userId = socket.handshake.query?.userId;
    console.log("Client connected:", socket.id, "User:", userId);

    if (userId) {
      userSocketMap.set(userId, socket.id);
    }

    socket.on("joinQueue", (data) => {
      const uid = data?.userId || userId;
      if (!uid) return;

      const isAlreadyInQueue = matchmakingQueue.some(p => p.socketId === socket.id);
      if (!isAlreadyInQueue) {
        matchmakingQueue.push({ socketId: socket.id, userId: uid });
        console.log(`Player ${uid} joined queue`);
        checkForMatch();
      }
    });

    socket.on("joinRoom", ({ roomId }) => {
      socket.join(roomId);
      activeGames.set(socket.id, roomId);
      console.log(`Socket ${socket.id} joined room ${roomId}`);
      socket.to(roomId).emit("opponentJoined", { socketId: socket.id });
    });

    socket.on("leaveRoom", ({ roomId }) => {
      socket.leave(roomId);
      console.log(`Socket ${socket.id} left room ${roomId}`);
      socket.to(roomId).emit("opponentLeft", { socketId: socket.id });
    });

    socket.on("movePiece", ({ roomId, move }) => {
      console.log(`Move in ${roomId}:`, move);
      socket.to(roomId).emit("opponentMove", move);
    });

    socket.on("sendChallenge", ({ toUserId, fromUserId }) => {
      const targetSocketId = userSocketMap.get(toUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("challengeReceived", { from: fromUserId });
        console.log(`Challenge sent from ${fromUserId} to ${toUserId}`);
      } else {
        socket.emit("challengeError", { error: "User is offline", toUserId });
      }
    });

    socket.on("declineChallenge", ({ toUserId, fromUserId }) => {
      const targetSocketId = userSocketMap.get(toUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("challengeDeclined", { from: fromUserId });
        console.log(`Challenge declined by ${fromUserId} for ${toUserId}`);
      }
    });

    socket.on("checkStatus", ({ userIds }) => {
      const statusMap = {};
      userIds.forEach(uid => {
        statusMap[uid] = userSocketMap.has(uid) ? "online" : "offline";
      });
      socket.emit("statusUpdate", { statusMap });
    });

    socket.on("ping", () => {
      socket.emit("pong", { timestamp: Date.now() });
    });

    socket.on("offerDraw", ({ roomId }) => {
      const roomSockets = io.sockets.adapter.rooms.get(roomId);
      console.log(`[SERVER] Draw offered in room ${roomId} by socket ${socket.id}. Sockets in room:`, roomSockets ? Array.from(roomSockets) : "none");
      // Use socket.to to send to all room members except the sender
      socket.to(roomId).emit("drawOffered");
      // Also broadcast via io.to for reliability (sender will also get it, but they already know)
      if (roomSockets) {
        roomSockets.forEach(sid => {
          if (sid !== socket.id) {
            io.to(sid).emit("drawOffered");
          }
        });
      }
    });

    socket.on("acceptDraw", async ({ roomId }) => {
      console.log(`[SERVER] Draw accepted in room ${roomId} by socket ${socket.id}`);
      try {
        const game = await prisma.game.findUnique({ where: { id: roomId } });
        if (!game || game.status !== "IN_PROGRESS") {
          console.log(`[SERVER] Game ${roomId} not valid for draw`);
          return;
        }

        await prisma.game.update({
          where: { id: roomId },
          data: { status: "COMPLETED", winnerId: null },
        });

        recentlyCompletedGames.add(roomId);
        setTimeout(() => recentlyCompletedGames.delete(roomId), 10000);

        const gameOverPayload = { winner: "draw", reason: "draw" };
        io.to(roomId).emit("gameOver", gameOverPayload);

        // Also emit directly to both player sockets for reliability
        const whitePlayer = await prisma.user.findUnique({ where: { id: game.whitePlayerId } });
        const blackPlayer = await prisma.user.findUnique({ where: { id: game.blackPlayerId } });
        const whiteSocketId = userSocketMap.get(whitePlayer?.walletAddress);
        const blackSocketId = userSocketMap.get(blackPlayer?.walletAddress);
        if (whiteSocketId) io.to(whiteSocketId).emit("gameOver", gameOverPayload);
        if (blackSocketId) io.to(blackSocketId).emit("gameOver", gameOverPayload);

        console.log(`[SERVER] Game ${roomId} ended in draw by agreement`);
      } catch (error) {
        console.error("Error processing draw acceptance:", error);
      }
    });

    socket.on("declineDraw", ({ roomId }) => {
      console.log(`[SERVER] Draw declined in room ${roomId} by socket ${socket.id}`);
      socket.to(roomId).emit("drawDeclined");
      // Also send directly for reliability
      const roomSockets = io.sockets.adapter.rooms.get(roomId);
      if (roomSockets) {
        roomSockets.forEach(sid => {
          if (sid !== socket.id) {
            io.to(sid).emit("drawDeclined");
          }
        });
      }
    });

    socket.on("resign", async ({ roomId, userId }) => {
      console.log(`[SERVER] Resignation received from ${userId} in room ${roomId}`);
      console.log(`[SERVER] Socket ${socket.id} rooms:`, Array.from(socket.rooms));
      try {
        const game = await prisma.game.findUnique({ where: { id: roomId } });
        console.log(`[SERVER] Game found:`, game ? { id: game.id, status: game.status, whitePlayerId: game.whitePlayerId, blackPlayerId: game.blackPlayerId } : null);
        if (!game) {
          console.error(`Game not found for roomId: ${roomId}`);
          socket.emit("resignError", { error: "Game not found" });
          return;
        }

        if (game.status !== "IN_PROGRESS") {
          console.log(`Game ${roomId} is not in progress, status: ${game.status}`);
          socket.emit("resignError", { error: "Game is not in progress" });
          return;
        }

        // Determine winner
        const whitePlayer = await prisma.user.findUnique({ where: { id: game.whitePlayerId } });
        const blackPlayer = await prisma.user.findUnique({ where: { id: game.blackPlayerId } });
        console.log(`[SERVER] Players - White: ${whitePlayer?.walletAddress}, Black: ${blackPlayer?.walletAddress}, Resigning userId: ${userId}`);

        let winnerId = null;
        let winnerColor = null;

        if (whitePlayer?.walletAddress === userId) {
          winnerId = game.blackPlayerId;
          winnerColor = "black";
        } else if (blackPlayer?.walletAddress === userId) {
          winnerId = game.whitePlayerId;
          winnerColor = "white";
        }

        if (!winnerId) {
          console.error(`Could not determine winner for resign. userId: ${userId}, white: ${whitePlayer?.walletAddress}, black: ${blackPlayer?.walletAddress}`);
          socket.emit("resignError", { error: "Could not determine winner" });
          return;
        }

        // Update game in database
        await prisma.game.update({
          where: { id: roomId },
          data: {
            status: "COMPLETED",
            winnerId: winnerId
          }
        });

        console.log(`[SERVER] Game ${roomId} ended by resignation. Winner: ${winnerColor}`);

        // Mark game as recently completed to prevent false disconnect forfeits
        recentlyCompletedGames.add(roomId);
        setTimeout(() => recentlyCompletedGames.delete(roomId), 10000); // Clean up after 10 seconds

        // Emit gameOver to all players in the room
        const roomSockets = io.sockets.adapter.rooms.get(roomId);
        console.log(`[SERVER] Emitting gameOver to room ${roomId}. Sockets in room:`, roomSockets ? Array.from(roomSockets) : "none");

        // Also emit directly to both players via their socket IDs for reliability
        const whiteSocketId = userSocketMap.get(whitePlayer?.walletAddress);
        const blackSocketId = userSocketMap.get(blackPlayer?.walletAddress);
        console.log(`[SERVER] Direct socket IDs - White: ${whiteSocketId}, Black: ${blackSocketId}`);

        const gameOverPayload = { winner: winnerColor, reason: "resignation" };

        // Emit to room (backup)
        io.to(roomId).emit("gameOver", gameOverPayload);

        // Also emit directly to both player sockets
        if (whiteSocketId) {
          io.to(whiteSocketId).emit("gameOver", gameOverPayload);
        }
        if (blackSocketId) {
          io.to(blackSocketId).emit("gameOver", gameOverPayload);
        }

        console.log(`[SERVER] gameOver event emitted successfully`);
      } catch (error) {
        console.error("Error processing resignation:", error);
        socket.emit("resignError", { error: "Server error processing resignation" });
      }
    });

    socket.on("gameComplete", async ({ roomId, winner, reason }) => {
      console.log(`[SERVER] Game complete received for room ${roomId}: winner=${winner}, reason=${reason}`);
      try {
        const game = await prisma.game.findUnique({ where: { id: roomId } });
        if (!game) {
          console.error(`[SERVER] Game not found for roomId: ${roomId}`);
          return;
        }

        if (game.status !== "IN_PROGRESS") {
          console.log(`[SERVER] Game ${roomId} is not in progress, status: ${game.status}`);
          return;
        }

        // Determine winner ID
        let winnerId = null;
        if (winner === "white") {
          winnerId = game.whitePlayerId;
        } else if (winner === "black") {
          winnerId = game.blackPlayerId;
        }
        // For draw, winnerId remains null

        // Update game in database
        await prisma.game.update({
          where: { id: roomId },
          data: {
            status: "COMPLETED",
            winnerId: winnerId
          }
        });

        console.log(`[SERVER] Game ${roomId} marked as COMPLETED. Winner: ${winner}, Reason: ${reason}`);

        // Mark game as recently completed to prevent false disconnect forfeits
        recentlyCompletedGames.add(roomId);
        setTimeout(() => recentlyCompletedGames.delete(roomId), 10000); // Clean up after 10 seconds

        // Emit gameOver to both players
        const gameOverPayload = { winner, reason };
        io.to(roomId).emit("gameOver", gameOverPayload);

        // Also emit directly to both player sockets for reliability
        const whitePlayer = await prisma.user.findUnique({ where: { id: game.whitePlayerId } });
        const blackPlayer = await prisma.user.findUnique({ where: { id: game.blackPlayerId } });

        const whiteSocketId = userSocketMap.get(whitePlayer?.walletAddress);
        const blackSocketId = userSocketMap.get(blackPlayer?.walletAddress);

        if (whiteSocketId) {
          io.to(whiteSocketId).emit("gameOver", gameOverPayload);
        }
        if (blackSocketId) {
          io.to(blackSocketId).emit("gameOver", gameOverPayload);
        }

        console.log(`[SERVER] gameOver event emitted for game completion`);
      } catch (error) {
        console.error("Error processing game completion:", error);
      }
    });

    socket.on("gameTimeout", async ({ roomId, loser }) => {
      console.log(`[SERVER] Timeout received for room ${roomId}: loser=${loser}`);
      try {
        const game = await prisma.game.findUnique({ where: { id: roomId } });
        if (!game) {
          console.error(`[SERVER] Game not found for roomId: ${roomId}`);
          return;
        }

        if (game.status !== "IN_PROGRESS") {
          console.log(`[SERVER] Game ${roomId} is not in progress, status: ${game.status}`);
          return;
        }

        // Determine winner ID (opposite of loser)
        const winnerId = loser === "white" ? game.blackPlayerId : game.whitePlayerId;
        const winnerColor = loser === "white" ? "black" : "white";

        // Update game in database
        await prisma.game.update({
          where: { id: roomId },
          data: {
            status: "COMPLETED",
            winnerId: winnerId
          }
        });

        console.log(`[SERVER] Game ${roomId} marked as COMPLETED due to timeout. Winner: ${winnerColor}`);

        // Mark game as recently completed to prevent false disconnect forfeits
        recentlyCompletedGames.add(roomId);
        setTimeout(() => recentlyCompletedGames.delete(roomId), 10000); // Clean up after 10 seconds

        // Emit gameOver to both players
        const gameOverPayload = { winner: winnerColor, reason: "timeout" };
        io.to(roomId).emit("gameOver", gameOverPayload);

        // Also emit directly to both player sockets for reliability
        const whitePlayer = await prisma.user.findUnique({ where: { id: game.whitePlayerId } });
        const blackPlayer = await prisma.user.findUnique({ where: { id: game.blackPlayerId } });

        const whiteSocketId = userSocketMap.get(whitePlayer?.walletAddress);
        const blackSocketId = userSocketMap.get(blackPlayer?.walletAddress);

        if (whiteSocketId) {
          io.to(whiteSocketId).emit("gameOver", gameOverPayload);
        }
        if (blackSocketId) {
          io.to(blackSocketId).emit("gameOver", gameOverPayload);
        }

        console.log(`[SERVER] gameOver event emitted for timeout`);
      } catch (error) {
        console.error("Error processing game timeout:", error);
      }
    });

    socket.on("acceptChallenge", async ({ opponentId, userId: myId }) => {
      const targetSocketId = userSocketMap.get(opponentId);

      if (targetSocketId) {
        try {
          const whiteUser = await prisma.user.findUnique({ where: { walletAddress: opponentId } });
          const blackUser = await prisma.user.findUnique({ where: { walletAddress: myId } });

          if (whiteUser && blackUser) {
            const game = await prisma.game.create({
              data: {
                whitePlayerId: whiteUser.id,
                blackPlayerId: blackUser.id,
                fen: "start",
                status: "IN_PROGRESS",
              },
            });

            const roomId = game.id;
            const s1 = socket;
            const s2 = io.sockets.sockets.get(targetSocketId);

            if (s1 && s2) {
              s1.join(roomId);
              s2.join(roomId);
              activeGames.set(s1.id, roomId);
              activeGames.set(s2.id, roomId);

              io.to(s1.id).emit("matchFound", { roomId, color: "black", opponent: opponentId });
              io.to(s2.id).emit("matchFound", { roomId, color: "white", opponent: myId });
              console.log(`Challenge accepted and persisted: ${opponentId} vs ${myId} in ${roomId}`);
            }
          }
        } catch (error) {
          console.error("Error creating challenge game in DB:", error);
        }
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);

      // (Moved userSocketMap cleanup to end to allow forfeit processing)

      // Remove from queue if present
      const index = matchmakingQueue.findIndex(p => p.socketId === socket.id);
      if (index !== -1) {
        matchmakingQueue.splice(index, 1);
      }
      // Remove from socket map
      const activeRoomId = activeGames.get(socket.id);
      if (activeRoomId) {
        console.log(`Socket ${socket.id} disconnected from active room ${activeRoomId}`);

        // Capture user ID synchronously before cleanup
        let disconnectedUserId = null;
        for (const [uid, sid] of userSocketMap.entries()) {
          if (sid === socket.id) {
            disconnectedUserId = uid;
            break;
          }
        }

        // Handle disconnect forfeit - check game status FIRST before emitting
        (async () => {
          try {
            // Skip if this game was recently completed (prevents race condition with gameComplete)
            if (recentlyCompletedGames.has(activeRoomId)) {
              console.log(`[SERVER] Game ${activeRoomId} was recently completed, skipping disconnect forfeit`);
              return;
            }

            const game = await prisma.game.findUnique({ where: { id: activeRoomId } });

            // Only process if game exists and is still IN_PROGRESS
            if (game && game.status === "IN_PROGRESS") {
              console.log(`[SERVER] Game ${activeRoomId} is still in progress, processing disconnect forfeit`);

              // Emit gameOver to room
              io.to(activeRoomId).emit("gameOver", { winner: "opponent", reason: "disconnection" });

              // Also emit directly to all sockets in the room for reliability
              const roomSockets = io.sockets.adapter.rooms.get(activeRoomId);
              if (roomSockets) {
                roomSockets.forEach(socketId => {
                  if (socketId !== socket.id) {
                    io.to(socketId).emit("gameOver", { winner: "opponent", reason: "disconnection" });
                  }
                });
              }

              // Update game in database
              if (disconnectedUserId) {
                const whiteUser = await prisma.user.findUnique({ where: { id: game.whitePlayerId } });
                const blackUser = await prisma.user.findUnique({ where: { id: game.blackPlayerId } });

                let winnerId = null;
                if (whiteUser?.walletAddress === disconnectedUserId) winnerId = game.blackPlayerId;
                else if (blackUser?.walletAddress === disconnectedUserId) winnerId = game.whitePlayerId;

                if (winnerId) {
                  await prisma.game.update({
                    where: { id: activeRoomId },
                    data: { status: "COMPLETED", winnerId }
                  });
                  console.log(`[SERVER] Game ${activeRoomId} marked as COMPLETED due to disconnect`);
                }
              }
            } else {
              console.log(`[SERVER] Game ${activeRoomId} is not in progress (status: ${game?.status}), skipping disconnect forfeit`);
            }
          } catch (e) {
            console.error("Error handling disconnect forfeit:", e);
          }
        })();

        activeGames.delete(socket.id);
      }

      if (userId) {
        userSocketMap.delete(userId);
      } else {
        for (const [uid, sid] of userSocketMap.entries()) {
          if (sid === socket.id) {
            userSocketMap.delete(uid);
            console.log(`User ${uid} removed from map (cleanup)`);
            break;
          }
        }
      }
    });
  });

  httpServer.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
