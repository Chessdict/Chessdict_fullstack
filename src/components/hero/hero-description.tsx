"use client";

import { motion } from "framer-motion";
import { descriptionVariants } from "./hero-animations";

export function HeroDescription() {
  return (
    <motion.div
      className="absolute right-1 z-2 bottom-30 max-w-2xl text-center text-white/80 lg:mt-16"
      variants={descriptionVariants}
    >
      <div className="mx-auto flex max-w-lg items-start gap-3 text-left lg:mx-0">
        <span className="mt-1 text-lg text-white" aria-hidden="true">
          ✦
        </span>
        <p className="text-base leading-relaxed">
          Challenge players around the world &amp; earn rewards. Whether you&apos;re a
          grandmaster or just getting started, Chessdict redefines how chess is played,
          owned, and experienced.
        </p>
      </div>
    </motion.div>
  );
}

