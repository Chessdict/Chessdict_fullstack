"use client";

import { useCallback, useRef } from "react";

const SOUND_PATHS = {
  move: "/sounds/move.mp3",
  capture: "/sounds/capture.mp3",
  check: "/sounds/check.mp3",
  promotion: "/sounds/promotion.mp3",
  gameOver: "/sounds/game-over.mp3",
} as const;

export function useChessSounds() {
  const ctxRef = useRef<AudioContext | null>(null);
  const audioCacheRef = useRef(new Map<string, HTMLAudioElement | null>());

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  const playAsset = useCallback((src: string) => {
    if (typeof Audio === "undefined") return false;

    const cached = audioCacheRef.current.get(src);
    if (cached === null) return false;

    const audio = cached ?? new Audio(src);
    audio.preload = "auto";
    audio.currentTime = 0;

    const playPromise = audio.play();
    if (!cached) {
      audioCacheRef.current.set(src, audio);
    }

    if (!playPromise) return true;

    playPromise.catch(() => {
      audioCacheRef.current.set(src, null);
    });

    return true;
  }, []);

  // Smooth move sound — soft wooden tap
  const playMove = useCallback(() => {
    if (playAsset(SOUND_PATHS.move)) return;

    const ctx = getCtx();
    const t = ctx.currentTime;

    // Short noise burst filtered to sound like a soft tap
    const duration = 0.08;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

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

  // Capture sound — heavier thud with low-end punch
  const playCapture = useCallback(() => {
    if (playAsset(SOUND_PATHS.capture)) return;

    const ctx = getCtx();
    const t = ctx.currentTime;

    // Low sine thump
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

    // Noise layer for texture
    const duration = 0.1;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

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

  // Check sound — bright alert tone
  const playCheck = useCallback(() => {
    if (playAsset(SOUND_PATHS.check)) return;

    const ctx = getCtx();
    const t = ctx.currentTime;

    // Two quick sine tones rising
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

  // Promotion sound — ascending chime
  const playPromotion = useCallback(() => {
    if (playAsset(SOUND_PATHS.promotion)) return;

    const ctx = getCtx();
    const t = ctx.currentTime;

    const notes = [440, 554, 659]; // A4, C#5, E5 — major triad
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      const start = t + i * 0.08;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);

      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.25);
    });
  }, [getCtx, playAsset]);

  // Game over sound — resolution chord
  const playGameOver = useCallback(() => {
    if (playAsset(SOUND_PATHS.gameOver)) return;

    const ctx = getCtx();
    const t = ctx.currentTime;

    const notes = [262, 330, 392]; // C4, E4, G4
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

  // Low time warning — urgent ticking/beep
  const playLowTime = useCallback(() => {
    const ctx = getCtx();
    const t = ctx.currentTime;

    // Two short urgent beeps
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
  }, [getCtx]);

  // Play the right sound based on a move result
  const playMoveSound = useCallback((move: { san: string; captured?: string; flags?: string }) => {
    const isPromotion = move.flags?.includes("p") || move.san.includes("=");
    const isCheck = move.san.includes("+") || move.san.includes("#");
    const isCapture = !!move.captured;

    if (isPromotion) {
      playPromotion();
    } else if (isCheck) {
      playCheck();
    } else if (isCapture) {
      playCapture();
    } else {
      playMove();
    }
  }, [playMove, playCapture, playCheck, playPromotion]);

  return { playMove, playCapture, playCheck, playPromotion, playGameOver, playLowTime, playMoveSound };
}
