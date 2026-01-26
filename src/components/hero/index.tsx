"use client";

import { motion } from "framer-motion";
import { HeroHeading } from "./hero-heading";
import { HeroPieces } from "./hero-pieces";
import { HeroDescription } from "./hero-description";
import { HeroCTA } from "./hero-cta";
import { containerVariants } from "./hero-animations";

/**
 * Hero section component featuring animated chess pieces and call-to-action
 */
export function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col justify-between pb-20 pt-32 text-white sm:pt-36 mb-25">
      <div className="absolute inset-0">
        <motion.div
          className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="hero-stage">
            <HeroHeading />
            <HeroPieces />
          </div>

          <HeroDescription />
          <HeroCTA />
        </motion.div>
      </div>
    </section>
  );
}

