"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ConnectWallet } from "./connect-wallet";

const navItems = [
  { href: "/play", label: "Play" },
  { href: "#leaderboard", label: "Leaderboard" },
  { href: "#community", label: "Community" },
  { href: "#blog", label: "Blog" },
  { href: "#whitepaper", label: "Whitepaper" },
];

export function Navbar() {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-6 z-30 flex justify-center px-4">
      <motion.nav
        className="pointer-events-auto nav-glass relative flex h-[86px] w-full max-w-6xl items-center justify-between rounded-full px-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as const }}
      >
        <svg aria-hidden="true" className="absolute inset-0 h-full w-full" fill="none">
          <defs>
            <linearGradient id="navGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.30)" />
              <stop offset="40%" stopColor="rgba(255,255,255,0.95)" />
              <stop offset="60%" stopColor="rgba(255,255,255,0.14)" />
            </linearGradient>
          </defs>
          <rect
            x={0.5}
            y={0.5}
            width="calc(100% - 1px)"
            height="calc(100% - 1px)"
            rx={43}
            stroke="url(#navGradient)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <Link href="/">
          <Image
            alt="Chessdict logo"
            className="relative h-20 w-auto sm:h-22"
            height={248}
            priority
            src="/logo.svg"
            width={200}
          />
        </Link>

        <div className="relative flex items-center gap-8 text-sm font-medium text-white/70">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="transition hover:text-white">
              {item.label}
            </Link>
          ))}
        </div>

        <ConnectWallet />
      </motion.nav>
    </header>
  );
}

