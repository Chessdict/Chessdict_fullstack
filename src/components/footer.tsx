"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

export function Footer() {
  return (
    <motion.footer
      className="relative z-10 flex w-full flex-col items-center gap-8 px-6 py-12"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as const }}
    >
      <div className="flex items-center gap-6">
        <Link
          href="https://discord.gg/chessdict"
          target="_blank"
          rel="noopener noreferrer"
          className="group relative flex h-16 w-16 items-center justify-center"
        >
          <Image
            src="/logo_discord.svg"
            alt="Discord"
            width={32}
            height={32}
            className="relative z-10 h-16 w-16"
          />
        </Link>

        <Link
          href="https://x.com/chessdict"
          target="_blank"
          rel="noopener noreferrer"
          className="group relative flex h-16 w-16 items-center justify-center"
        >
          <Image
            src="/logo_x.svg"
            alt="X (Twitter)"
            width={32}
            height={32}
            className="relative z-10 h-16 w-16"
          />
        </Link>

        <Link
          href="https://t.me/chessdict"
          target="_blank"
          rel="noopener noreferrer"
          className="group relative flex h-16 w-16 items-center justify-center"
        >
          <Image
            src="/logo_telegram.svg"
            alt="Telegram"
            width={32}
            height={32}
            className="relative z-10 h-16 w-16"
          />
        </Link>
      </div>

      <p className="text-sm text-white/60">© 2025 Chessdict Foundation</p>
    </motion.footer>
  );
}

