"use client";

import { useCallback, useRef } from "react";

const SOUND_PATHS = {
  move: "/sounds/moved-piece.mp3",
  opponentMove: "/sounds/moved-opponent-piece.mp3",
  capture: "/sounds/game-stop.mp3",
  check: "/sounds/game-stop.mp3",
  promotion: "/sounds/when-you-promote.mp3",
  castle: "/sounds/when-you-castle.mp3",
  gameOver: "/sounds/checkmate.mp3",
  gameStart: "/sounds/game-start.mp3",
  illegalMove: "/sounds/illegal-move.mp3",
  notification: "/sounds/notification.mp3",
  timeOut: "/sounds/time-out.mp3",
} as const;

function createNoiseBuffer(
  ctx: AudioContext,
  duration: number,
  decayFactor: number,
) {
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * decayFactor));
  }

  return buffer;
}

export function useChessSounds() {
  const ctxRef = useRef<AudioContext | null>(null);
  const audioCacheRef = useRef(new Map<string, HTMLAudioElement>());
  const failedAssetRef = useRef(new Set<string>());

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    if (ctxRef.current.state === "suspended") {
      void ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  const playAsset = useCallback((src: string, volume = 0.8) => {
    if (typeof Audio === "undefined") return false;

    if (failedAssetRef.current.has(src)) return false;

    let audio = audioCacheRef.current.get(src);
    if (!audio) {
      audio = new Audio(src);
      audio.preload = "auto";
      audio.addEventListener(
        "error",
        () => {
          failedAssetRef.current.add(src);
        },
        { once: true },
      );
      audioCacheRef.current.set(src, audio);
    }

    audio.volume = volume;
    audio.currentTime = 0;

    const playPromise = audio.play();
    if (!playPromise) return true;

    playPromise.catch(() => {
      // Playback rejections are often temporary browser-policy issues.
      // Keep the asset cached so the next user-initiated sound can retry.
    });

    return true;
  }, []);

  // Use the extracted asset pack first, but keep a synthetic fallback so sound
  // does not silently disappear if a browser blocks or misses a file.
  const playMove = useCallback(() => {
    if (playAsset(SOUND_PATHS.move, 0.85)) return;

    const ctx = getCtx();
    const t = ctx.currentTime;
    const duration = 0.08;
    const source = ctx.createBufferSource();
    source.buffer = createNoiseBuffer(ctx, duration, 0.15);

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 800;
    bandpass.Q.value = 1.5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(bandpass).connect(gain).connect(ctx.destination);
    source.start(t);
    source.stop(t + duration);
  }, [getCtx, playAsset]);

  const playOpponentMove = useCallback(() => {
    if (playAsset(SOUND_PATHS.opponentMove, 0.82)) return;
    playMove();
  }, [playAsset, playMove]);

  const playCapture = useCallback(() => {
    if (playAsset(SOUND_PATHS.capture, 0.9)) return;

    const ctx = getCtx();
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.35, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(oscGain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.15);

    const duration = 0.1;
    const source = ctx.createBufferSource();
    source.buffer = createNoiseBuffer(ctx, duration, 0.1);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 600;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(lp).connect(noiseGain).connect(ctx.destination);
    source.start(t);
    source.stop(t + duration);
  }, [getCtx, playAsset]);

  const playCheck = useCallback(() => {
    if (playAsset(SOUND_PATHS.check, 0.88)) return;

    const ctx = getCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.setValueAtTime(680, t + 0.08);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.2, t + 0.01);
    gain.gain.setValueAtTime(0.2, t + 0.07);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.09);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  }, [getCtx, playAsset]);

  const playPromotion = useCallback(() => {
    if (playAsset(SOUND_PATHS.promotion, 0.88)) return;

    const ctx = getCtx();
    const t = ctx.currentTime;
    const notes = [440, 554, 659];

    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      const start = t + index * 0.08;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);

      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.25);
    });
  }, [getCtx, playAsset]);

  const playWhenCastle = useCallback(() => {
    if (playAsset(SOUND_PATHS.castle, 0.88)) return;
    playMove();
  }, [playAsset, playMove]);

  const playGameOver = useCallback(() => {
    if (playAsset(SOUND_PATHS.gameOver, 0.92)) return;

    const ctx = getCtx();
    const t = ctx.currentTime;
    const notes = [262, 330, 392];

    notes.forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  }, [getCtx, playAsset]);

  const playNotification = useCallback(() => {
    if (playAsset(SOUND_PATHS.notification, 0.85)) return;

    const ctx = getCtx();
    const t = ctx.currentTime;

    [740, 988].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      const start = t + index * 0.07;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);

      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.15);
    });
  }, [getCtx, playAsset]);

  const playTimeOut = useCallback(() => {
    if (playAsset(SOUND_PATHS.timeOut, 0.9)) return;

    const ctx = getCtx();
    const t = ctx.currentTime;

    [0, 0.15].forEach((offset) => {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = 880;

      const gain = ctx.createGain();
      const start = t + offset;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);

      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.1);
    });
  }, [getCtx, playAsset]);

  const playLowTime = useCallback(() => {
    playTimeOut();
  }, [playTimeOut]);

  const playIllegalMove = useCallback(() => {
    if (playAsset(SOUND_PATHS.illegalMove, 0.85)) return;

    const ctx = getCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.12);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.14, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  }, [getCtx, playAsset]);

  const playGameStart = useCallback(() => {
    if (playAsset(SOUND_PATHS.gameStart, 0.88)) return;
    playNotification();
  }, [playAsset, playNotification]);

  const playMoveSound = useCallback(
    (move: { san: string; captured?: string; flags?: string }) => {
      const isPromotion = move.flags?.includes("p") || move.san.includes("=");
      const isCheck = move.san.includes("+") || move.san.includes("#");
      const isCapture = !!move.captured;
      const isCastle = move.flags?.includes("k") || move.flags?.includes("q");

      if (isPromotion) {
        playPromotion();
      } else if (isCheck) {
        playCheck();
      } else if (isCapture) {
        playCapture();
      } else if (isCastle) {
        playWhenCastle();
      } else {
        playMove();
      }
    },
    [playCapture, playCheck, playMove, playPromotion, playWhenCastle],
  );

  return {
    playMove,
    playOpponentMove,
    playCapture,
    playCheck,
    playPromotion,
    playWhenCastle,
    playGameOver,
    playGameStart,
    playNotification,
    playTimeOut,
    playLowTime,
    playIllegalMove,
    playMoveSound,
  };
}
