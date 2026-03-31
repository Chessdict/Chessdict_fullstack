"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ConnectWallet } from "./connect-wallet";
import { ArrowLeft, Menu, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

const navItems = [
  { href: "/play", label: "Play" },
  { href: "/watch", label: "Watch" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/play", label: "Tournaments" },
  { href: "/", label: "Creator program" },
  { href: "/", label: "Markets" },
  { href: "/claims", label: "Claims" },
  // { href: "#community", label: "Community" },
  // { href: "#blog", label: "Blog" },
  // { href: "#whitepaper", label: "Whitepaper" },
];

export function Navbar() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { isConnected } = useAccount();

  const pathname = usePathname();
  const router = useRouter();
  const isProfilePage = pathname === "/profile";

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname && pathname !== "/profile") {
      window.sessionStorage.setItem("lastNonProfilePath", pathname);
    }
  }, [pathname]);

  const handleMobileProfileClick = () => {
    if (typeof window === "undefined") {
      router.push(isProfilePage ? "/play" : "/profile");
      return;
    }

    if (isProfilePage) {
      const previousPath = window.sessionStorage.getItem("lastNonProfilePath") || "/play";
      router.push(previousPath);
      return;
    }

    router.push("/profile");
  };

  return (
    <header className="w-full">
      {/* Desktop Navbar */}
      <div className={`${pathname === '/' ? 'fixed inset-x-0 top-6' : 'relative py-6'} pointer-events-none z-2000 justify-center px-4 hidden lg:flex`}>
        <motion.nav
          className="pointer-events-auto nav-glass relative flex h-21.5 w-full max-w-6xl items-center justify-between rounded-full px-8"
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

          <div className="relative bg-white/5 py-3.75 px-7.5 rounded-full flex items-start gap-8 text-sm font-medium text-white/70">
            {navItems.map((item) => (
              <Link key={item.label} href={item.href} className="transition hover:text-white">
                {item.label}
              </Link>
            ))}
          </div>

          <ConnectWallet />
        </motion.nav>
      </div>

      {/* Mobile Navbar */}
      <div className={`${pathname === '/' ? 'fixed inset-x-0 top-6' : 'relative py-4'} pointer-events-none px-4 z-30 flex justify-center lg:hidden`}>
        <motion.nav
          className="pointer-events-auto nav-glass relative flex h-12.5 w-full items-center justify-between rounded-full px-2"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <Link href="/" className="shrink-0">
            <Image
              alt="Chessdict logo"
              className="relative h-20 w-auto sm:h-22"
              height={248}
              priority
              src="/logo.svg"
              width={200}
            />
          </Link>

          <div className="z-20 flex items-center gap-2">
            {isConnected ? (
              <button
                type="button"
                onClick={handleMobileProfileClick}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label={isProfilePage ? "Go back" : "Open profile"}
              >
                {isProfilePage ? (
                  <ArrowLeft className="h-4.5 w-4.5" />
                ) : (
                  <User className="h-4.5 w-4.5" />
                )}
              </button>
            ) : null}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTitle></SheetTitle>
              <SheetTrigger asChild>
                <button className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:bg-white/10">
                  <Menu />
                </button>
              </SheetTrigger>
              <SheetContent>
                <div className="w-full px-4 py-20 space-y-4">
                  <div className="w-full relative flex flex-col items-start gap-4 text-sm font-medium text-white/70">
                    {navItems.map((item) => (
                      <SheetClose asChild key={item.label}>
                        <Link
                          key={item.label}
                          href={item.href}
                          className="w-full transition hover:text-white text-center py-4 rounded-lg duration-300"
                        >
                          {item.label}
                        </Link>
                      </SheetClose>
                    ))}
                  </div>
                  <div className="border flex justify-center rounded-lg">
                    <ConnectWallet onActionComplete={() => setSheetOpen(false)} />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </motion.nav>
      </div>
    </header>
  );
}
