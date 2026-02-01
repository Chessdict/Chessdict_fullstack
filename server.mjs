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
  const matchmakingQueue = [];

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
          if (s1) s1.join(roomId);
          if (s2) s2.join(roomId);

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
      console.log(`Socket ${socket.id} joined room ${roomId}`);
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

      // Remove from userSocketMap
      for (const [uid, sid] of userSocketMap.entries()) {
        if (sid === socket.id) {
          userSocketMap.delete(uid);
          console.log(`User ${uid} removed from map`);
          break;
        }
      }

      // Remove from queue if present
      const index = matchmakingQueue.findIndex(p => p.socketId === socket.id);
      if (index !== -1) {
        matchmakingQueue.splice(index, 1);
      }
      // Remove from socket map
      if (userId) {
        userSocketMap.delete(userId);
      }
    });
  });

  httpServer.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
