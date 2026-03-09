"use client";

import { useEffect, useState } from "react";
import io, { Socket } from "socket.io-client";

// Singleton socket instance shared across all components
let sharedSocket: Socket | null = null;
let sharedUserId: string | undefined = undefined;
let refCount = 0;

function getOrCreateSocket(userId?: string): Socket {
  // If userId changed or no socket exists, create a new one
  if (sharedSocket && sharedUserId !== userId) {
    sharedSocket.disconnect();
    sharedSocket = null;
  }

  if (!sharedSocket) {
    sharedSocket = io({
      path: "/socket.io",
      query: userId ? { userId } : {},
    });
    sharedUserId = userId;
  }

  return sharedSocket;
}

export const useSocket = (userId?: string) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socketInstance = getOrCreateSocket(userId);
    refCount++;

    const onConnect = () => {
      console.log("Connected to socket server", { socketId: socketInstance.id, userId });
      setIsConnected(true);
    };

    const onDisconnect = () => {
      console.log("Disconnected from socket server");
      setIsConnected(false);
    };

    const onConnectError = (error: Error) => {
      console.error("Connection error:", error);
    };

    socketInstance.on("connect", onConnect);
    socketInstance.on("disconnect", onDisconnect);
    socketInstance.on("connect_error", onConnectError);

    // If already connected, set state immediately
    if (socketInstance.connected) {
      setIsConnected(true);
    }

    setSocket(socketInstance);

    return () => {
      refCount--;
      socketInstance.off("connect", onConnect);
      socketInstance.off("disconnect", onDisconnect);
      socketInstance.off("connect_error", onConnectError);

      // Only disconnect when no components are using the socket
      if (refCount <= 0) {
        socketInstance.disconnect();
        sharedSocket = null;
        sharedUserId = undefined;
        refCount = 0;
      }
    };
  }, [userId]);

  return { socket, isConnected };
};
