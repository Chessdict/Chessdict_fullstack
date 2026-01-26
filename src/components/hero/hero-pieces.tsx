"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import {
  ANIMATION_DURATION,
  ANIMATION_DELAY,
  EASING,
  PIECES_ANIMATION_VALUES,
  PIECES_TRANSITION,
} from "./hero-animations";

export function HeroPieces() {
  const shouldReduceMotion = useReducedMotion();

  // Simplified animation for reduced motion preference
  const animationValues = shouldReduceMotion
    ? { opacity: 1 }
    : {
        opacity: 1,
        ...PIECES_ANIMATION_VALUES,
      };

  return (
    <>
      <div className="hero-pieces-shadow" />
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 40, rotate: -5 }}
        animate={animationValues}
        transition={PIECES_TRANSITION}
        style={{
          willChange: shouldReduceMotion ? "auto" : "transform",
        }}
      >
        <Image
          alt="Chess pieces on pedestal"
          className="hero-pieces"
          height={720}
          priority
          src="/images/king_pin.svg"
          width={720}
        />
      </motion.div>
    </>
  );
}

