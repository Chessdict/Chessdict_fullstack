"use client";

import { useEffect, useState, useRef } from "react";
import io, { Socket } from "socket.io-client";

export const useSocket = (userId?: string) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Clean up previous socket if userId changes
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const socketInstance = io({
      path: "/socket.io",
      query: userId ? { userId } : {},
    });

    socketRef.current = socketInstance;

    socketInstance.on("connect", () => {
      console.log("Connected to socket server", { socketId: socketInstance.id, userId });
      setIsConnected(true);
    });

    socketInstance.on("disconnect", () => {
      console.log("Disconnected from socket server");
      setIsConnected(false);
    });

    socketInstance.on("connect_error", (error) => {
      console.error("Connection error:", error);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
      socketRef.current = null;
    };
  }, [userId]);

  return { socket, isConnected };
};
