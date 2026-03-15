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
      case "excellent": return "#e2e8f0";
      case "good": return "#cbd5e1";
      case "fair": return "#facc15";
      case "poor": return "#ef4444";
      case "disconnected": return "#6b7280";
    }
  }
  switch (level) {
    case "excellent": return "#22c55e";
    case "good": return "#86efac";
    case "fair": return "#facc15";
    case "poor": return "#ef4444";
    case "disconnected": return "#6b7280";
  }
}

function getLabel(level: SignalLevel, ping: number): string {
  if (level === "disconnected") return "No connection";
  return `${ping}ms`;
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

  const barHeights = [6, 10, 14, 18];

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-end gap-[2px]">
        {barHeights.map((h, i) => (
          <div
            key={i}
            style={{
              width: 3,
              height: h,
              borderRadius: 1,
              backgroundColor: i < bars ? color : "rgba(255,255,255,0.15)",
              transition: "background-color 0.3s ease",
            }}
          />
        ))}
      </div>
      <span
        className="text-[10px] font-mono tabular-nums"
        style={{ color }}
      >
        {label}
      </span>
    </div>
  );
}
