"use client";

import { useState, useEffect, useCallback } from "react";
import { type Socket } from "socket.io-client";

interface SignalStrengthProps {
  /** Provide an external ping value in ms, or pass a socket to auto-measure */
  ping?: number;
  /** Socket instance to auto-measure ping (used if ping prop is not provided) */
  socket?: Socket | null;
  /** Whether the socket is connected */
  isConnected?: boolean;
  /** Measurement interval in ms (default: 5000) */
  interval?: number;
  /** Color variant: "player" uses green tones, "opponent" uses white/neutral tones */
  variant?: "player" | "opponent";
}

type SignalLevel = "excellent" | "good" | "fair" | "poor" | "disconnected";

function getSignalLevel(ping: number, connected: boolean): SignalLevel {
  if (!connected) return "disconnected";
  if (ping <= 0) return "disconnected";
  if (ping < 80) return "excellent";
  if (ping < 150) return "good";
  if (ping < 300) return "fair";
  return "poor";
}

function getBarCount(level: SignalLevel): number {
  switch (level) {
    case "excellent": return 4;
    case "good": return 3;
    case "fair": return 2;
    case "poor": return 1;
    case "disconnected": return 0;
  }
}

function getColor(level: SignalLevel, variant: "player" | "opponent"): string {
  if (variant === "opponent") {
    switch (level) {
      case "excellent": return "#f8fafc";
      case "good": return "#dbe4f0";
      case "fair": return "#fde68a";
      case "poor": return "#fca5a5";
      case "disconnected": return "#94a3b8";
    }
  }
  switch (level) {
    case "excellent": return "#6ee7b7";
    case "good": return "#a7f3d0";
    case "fair": return "#fde68a";
    case "poor": return "#fca5a5";
    case "disconnected": return "#94a3b8";
  }
}

function getLabel(level: SignalLevel, ping: number): string {
  if (level === "disconnected") return "No connection";
  return `${level} connection (${ping}ms)`;
}

export function SignalStrength({
  ping: externalPing,
  socket,
  isConnected = true,
  interval = 5000,
  variant = "player",
}: SignalStrengthProps) {
  const [measuredPing, setMeasuredPing] = useState<number>(0);

  const handlePong = useCallback((data: { timestamp: number }) => {
    setMeasuredPing(Date.now() - data.timestamp);
  }, []);

  // Auto-measure ping when socket is provided and no external ping
  useEffect(() => {
    if (externalPing !== undefined) return;
    if (!socket || !isConnected) return;

    socket.on("pong", handlePong);

    const pingInterval = setInterval(() => {
      socket.emit("ping", { timestamp: Date.now() });
    }, interval);

    // Measure immediately
    socket.emit("ping", { timestamp: Date.now() });

    return () => {
      clearInterval(pingInterval);
      socket.off("pong", handlePong);
    };
  }, [socket, isConnected, externalPing, interval, handlePong]);

  const ping = externalPing ?? measuredPing;
  const level = getSignalLevel(ping, isConnected);
  const bars = getBarCount(level);
  const color = getColor(level, variant);
  const label = getLabel(level, ping);

  const barHeights = [12, 12, 12, 12];
  const shellClasses =
    variant === "opponent"
      ? "border-white/12 bg-white/6"
      : "border-emerald-200/12 bg-emerald-200/8";

  return (
    <div
      className={`flex h-7 items-center gap-[3px] rounded-full border px-2.5 ${shellClasses}`}
      aria-label={label}
      title={label}
    >
        {barHeights.map((h, i) => (
          <div
            key={i}
            style={{
              width: 6,
              height: h,
              borderRadius: 999,
              backgroundColor: i < bars ? color : "rgba(255,255,255,0.15)",
              boxShadow:
                i < bars
                  ? `inset 0 1px 0 rgba(255,255,255,0.35), 0 0 10px ${color}22`
                  : "inset 0 1px 0 rgba(255,255,255,0.08)",
              transition: "background-color 0.3s ease, box-shadow 0.3s ease",
            }}
          />
        ))}
    </div>
  );
}
