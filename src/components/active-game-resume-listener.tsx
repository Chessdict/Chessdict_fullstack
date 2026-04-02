"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useSocket } from "@/hooks/useSocket";

type GameRejoinedPayload = {
  status?: string | null;
  roomId: string;
};

function isPlayManagedPath(pathname: string) {
  return (
    pathname === "/play" ||
    pathname.startsWith("/play/game/") ||
    pathname.startsWith("/play/challenge/") ||
    pathname.startsWith("/play/tournament/")
  );
}

export function ActiveGameResumeListener() {
  const { address, isConnected } = useAccount();
  const { socket } = useSocket(address ?? undefined);
  const pathname = usePathname();
  const router = useRouter();
  const lastRedirectRef = useRef<string | null>(null);

  useEffect(() => {
    if (!socket || !isConnected || !address) return;
    if (isPlayManagedPath(pathname)) return;

    const handleGameRejoined = (data: GameRejoinedPayload) => {
      if (!data?.roomId) return;

      const targetPath =
        data.status === "WAITING" ? "/play" : `/play/game/${data.roomId}`;

      if (pathname === targetPath) return;
      if (lastRedirectRef.current === targetPath) return;

      lastRedirectRef.current = targetPath;
      router.replace(targetPath);
    };

    socket.on("gameRejoined", handleGameRejoined);
    return () => {
      socket.off("gameRejoined", handleGameRejoined);
    };
  }, [address, isConnected, pathname, router, socket]);

  return null;
}
