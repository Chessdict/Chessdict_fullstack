import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

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

  const checkForMatch = () => {
    if (matchmakingQueue.length >= 2) {
      const p1 = matchmakingQueue.shift();
      const p2 = matchmakingQueue.shift();
      const roomId = `room_${p1.userId}_${p2.userId}`;

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

      console.log(`Match found: ${p1.userId} vs ${p2.userId} in ${roomId}`);
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

    socket.on("movePiece", ({ roomId, move }) => {
      console.log(`Move in ${roomId}:`, move);
      socket.to(roomId).emit("opponentMove", move);
    });

    socket.on("sendChallenge", ({ toUserId, fromUserId }) => {
      const targetSocketId = userSocketMap.get(toUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("challengeReceived", { from: fromUserId });
        console.log(`Challenge sent from ${fromUserId} to ${toUserId}`);
      }
    });

    socket.on("acceptChallenge", ({ opponentId, userId: myId }) => {
      const roomId = `room_${opponentId}_${myId}`;
      const targetSocketId = userSocketMap.get(opponentId);

      if (targetSocketId) {
        const s1 = socket;
        const s2 = io.sockets.sockets.get(targetSocketId);

        if (s1 && s2) {
          s1.join(roomId);
          s2.join(roomId);

          io.to(s1.id).emit("matchFound", { roomId, color: "black", opponent: opponentId });
          io.to(s2.id).emit("matchFound", { roomId, color: "white", opponent: myId });
          console.log(`Challenge accepted: ${opponentId} vs ${myId}`);
        }
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
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
