"use client";

import { useEffect, useState } from "react";
import io, { Socket } from "socket.io-client";

export const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socketInstance = io("http://localhost:3000", {
      path: "/socket.io",
    });

    socketInstance.on("connect", () => {
      console.log("Connected to socket server");
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
    };
  }, []);

  return { socket, isConnected };
};
