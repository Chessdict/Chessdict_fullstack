"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { GlassButton } from "../glass-button";
import { buttonVariants } from "./hero-animations";

export function HeroCTA() {
  const router = useRouter();

  return (
    <motion.div
      className="mt-10 flex flex-wrap items-center justify-center gap-4 lg:mt-2"  // Adjusted to stop overlapping with social icons
      variants={buttonVariants}
    >
      <GlassButton className="cursor-pointer" onClick={() => router.push("/play")}>
        Get started
      </GlassButton>
    </motion.div>
  );
}
