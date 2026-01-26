"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { GlassButton } from "../glass-button";
import { buttonVariants } from "./hero-animations";

export function HeroCTA() {
  return (
    <motion.div
      className="mt-10 flex flex-wrap items-center justify-center gap-4 lg:mt-12"
      variants={buttonVariants}
    >
      <Link href="/play">
        <GlassButton>Get started</GlassButton>
      </Link>
    </motion.div>
  );
}

