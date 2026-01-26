"use client";

import { motion } from "framer-motion";
import { wordVariants } from "./hero-animations";

const WORDS = ["Ultimate", "Chess", "Arena"] as const;
const IMAGE_MAP: Record<(typeof WORDS)[number], string> = {
  Ultimate: "/UTIMATE.svg", // file name in public folder
  Chess: "/CHESS.svg",
  Arena: "/ARENA.svg",
};

export function HeroHeading() {
  return (
    <div className="hero-heading-grid">
      {WORDS.map((word) => (
        <motion.span
          key={word}
          className={`hero-word hero-word-${word.toLowerCase()}`}
          variants={wordVariants}
        >
          <img
            src={IMAGE_MAP[word]}
            alt={word}
            className="block h-auto w-auto select-none pointer-events-none"
            loading={word === "Ultimate" ? "eager" : "lazy"}
          />
        </motion.span>
      ))}
    </div>
  );
}

