"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GlassButton } from "../glass-button";
import { ArrowUpRight } from "lucide-react";
import { CHESSDICT_SOCIALS } from "@/lib/constants";

const EASE = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay, ease: EASE },
  }),
};

const STEPS = [
  {
    number: 1,
    title: "Connect Wallet",
    description:
      "Securely connect your wallet to access Chessdict and manage your tokens.",
    gradient: "from-orange-500/20 to-amber-500/20",
    image: "/images/how-it-works/image-1.svg",
    icons: ["/logo_discord.svg", "/logo_x.svg", "/logo_telegram.svg"],
  },
  {
    number: 2,
    title: "Create a Match",
    description:
      "Browse open matches or create one by setting the stake amount and inviting opponents.",
    gradient: "from-blue-500/20 to-cyan-500/20",
    image: "/images/how-it-works/image-2.svg",
  },
  {
    number: 3,
    title: "Play the Game",
    description:
      "Compete in real-time chess matches where strategy and skill determine the winner.",
    gradient: "from-purple-500/20 to-pink-500/20",
    image: "/images/how-it-works/image-3.svg",
  },
  {
    number: 4,
    title: "Win & Earn",
    description:
      "Winners receive the staked rewards directly in their wallet through transparent on-chain transactions.",
    gradient: "from-green-500/20 to-emerald-500/20",
    image: "/images/how-it-works/image-4.svg",
  },
];

export function Hero() {
  const router = useRouter();

  const handleGetStarted = () => {
    router.push("/play");
  };

  return (
    <div className="w-full relative z-10 flex flex-col items-center">
      {/* ─── Hero Section ─── */}
      <section className="w-full relative flex flex-col items-center px-0 md:px-4 pt-28 mb-132 md:mb-100 sm:pt-36 pb-16 sm:pb-24 text-center max-w-7xl mx-auto">
        {/* Badge */}
        <motion.div
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mb-6"
        >
          <Link
            href="/play"
            className="inline-flex items-center gap-2 rounded-full border border-brand-primary-400 bg-brand-primary-100 pl-[20px] pr-[16px] py-[3px] text-[13px] sm:text-sm text-white font-medium transition shadow-[0px_2px_30px_0px_rgba(255,94,94,0.2)]"
          >
            <div className="w-12.75 h-5.25">
              <Image
                src="/svgs/users.svg"
                alt="users image"
                width={10}
                height={10}
                className="h-full w-full"
              />
            </div>
            <span>Play, Learn & Earn through chess</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </motion.div>

        {/* Heading */}
        <motion.h1
          custom={0.1}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="text-[50px] sm:text-5xl md:text-[82px] font-bold leading-[1.1] tracking-tight"
        >
          Chess{" "}
          <span className="text-transparent bg-clip-text bg-linear-to-r from-white to-brand-primary-200">
            Online
          </span>
          <br />
          and{" "}
          <span className="text-transparent bg-clip-text bg-linear-to-r from-white to-brand-primary-200">
            On-chain
          </span>
        </motion.h1>

        {/* Description */}
        <motion.p
          custom={0.25}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mt-5 max-w-lg text-sm sm:text-base text-white/60 leading-relaxed px-4 md:px-0"
        >
          Compete with players around the world, whether you&apos;re a grandmaster or
          you&apos;re just getting started there&apos;s a place to earn whilst having fun
          with chessdict.
        </motion.p>

        {/* CTA */}
        <motion.div
          custom={0.4}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mt-8"
        >
          <div className="hidden md:block">
            <GlassButton className="text-sm sm:text-base" onClick={handleGetStarted}>
              Get started
            </GlassButton>
          </div>
          <button
            type="button"
            onClick={handleGetStarted}
            className="md:hidden h-14 border-[0.8px] border-white group relative z-100 inline-flex items-center justify-center rounded-full px-14 text-sm tracking-wide text-white"
          >
            Get started
          </button>
        </motion.div>

        {/* Browser Mockup */}
        <div
          className="mt-0 sm:mt-0 w-full"
        >
          {/* Desktop image */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.9, delay: 0.55, ease: EASE }}
            className="pointer-events-none absolute z-50 right-0 left-0 -bottom-96 hidden md:block w-full h-[603px]"
          >
            <Image
              src="/images/hero-image.svg"
              alt="hero-image"
              width={100}
              height={100}
              className="w-full h-full"
            />
          </motion.div>

          {/* Mobile image */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.9, delay: 0.55, ease: EASE }}
            className="pointer-events-none absolute z-50 right-0 left-0 -bottom-128 md:hidden w-full h-[603px]"
          >
            <Image
              src="/images/hero-image-mobile.svg"
              alt="hero-image"
              width={100}
              height={100}
              className="w-full h-full object-cover"
            />
          </motion.div>
        </div>

        <div className="absolute top-0 hidden md:block">
          <Image
            src="/svgs/hero-navbar-bg-color.svg"
            alt="hero-navbar-bg-color"
            width={100}
            height={100}
            className="w-full h-full"
          />

        </div>
        <div className="w-full absolute top-0 md:hidden">
          <Image
            src="/svgs/hero-navbar-bg-color-mobile.svg"
            alt="hero-navbar-bg-color"
            width={100}
            height={100}
            className="w-full h-full"
          />
        </div>
      </section>

      {/* ─── How it Works ─── */}
      <section className="w-full px-4 py-16 sm:py-24 max-w-5xl mx-auto">
        <div className="flex flex-col items-center">
          <motion.div className="w-full">
            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.7, ease: EASE }}
              className="text-[44px] sm:text-4xl md:text-[60px] font-bold"
            >
              <span className="text-transparent bg-clip-text bg-linear-to-r from-white to-brand-primary-200">
                How it{" "}
                Works
              </span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
              className="mt-3 text-xs md:text-sm text-white/50 max-w-md"
            >
              Start playing competitive chess on-chain in just a few simple steps.
            </motion.p>
          </motion.div>


          {/* Steps grid - 2 cols desktop, 1 col mobile */}
          <div className="mt-10 sm:mt-14 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 w-full">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.6, delay: i * 0.1, ease: EASE }}
                className="h-[325px] md:h-[440px] flex flex-col justify-between rounded-2xl p-5 border-[1.5px] border-brand-primary-300/30 bg-brand-primary-300/10 opacity-50 backdrop-blur-sm overflow-hidden"
              >
                {/* Card image area */}
                <div
                  className={`flex items-center justify-center relative overflow-hidden`}
                >
                  <div className="w-full h-full">
                    <Image
                      src={step.image}
                      alt={`${step.title} image`}
                      width={100}
                      height={100}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                {/* Card text */}
                <div className="flex flex-start gap-4">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="flex h-[40px] w-[40px] items-center justify-center rounded-[14px] border-[1.5px] border-brand-primary-200 bg-brand-primary-300 text-xl font-semibold text-brand-primary-10">
                      {step.number}
                    </span>
                  </div>
                  <div className="">
                    <h3 className="text-[30px] sm:text-[40px] font-medium text-white">
                      {step.title}
                    </h3>
                    <p className="text-xs flex flex-col sm:text-sm text-white/50 leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Play & Earn CTA ─── */}
      <section className="w-full relative px-4 py-16 sm:py-24 max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: EASE }}
          className="rounded-3xl relative border border-white/10 bg-linear-to-br from-amber-950/30 via-[#1a1a1a]/80 to-[#1a1a1a]/80 overflow-hidden"
        >
          <div className="flex flex-col-reverse md:flex-row items-center gap-6 sm:gap-10 p-6 sm:p-10 md:p-14">
            {/* Chess piece image */}
            <div className="w-full sm:w-52 md:w-64 shrink-0">
              <Image
                src="/svgs/chessboard.svg"
                alt="Chess pieces"
                width={256}
                height={320}
                className="w-full h-auto drop-shadow-2xl"
              />
            </div>

            {/* Text */}
            <div className="flex-1 md:text-center md:text-left">
              <h2 className="text-[44px] sm:text-4xl md:text-[60px] font-bold leading-[60px]">
                Play & Earn
                <br />
                <span className="text-transparent bg-clip-text bg-linear-to-r from-white to-brand-primary-200">
                  On-Chain{" "} Rewards
                </span>
              </h2>
              <p className="mt-4 text-sm sm:text-xs font-light text-white/50 leading-relaxed max-w-lg">
                Chessdict is a next-generation chess platform where strategy meets
                opportunity. Challenge players from around the world, sharpen your
                gameplay through real competition, and earn rewards through transparent
                on-chain matches. Built for both passionate learners and competitive
                players, Chessdict transforms every move into a meaningful step toward
                mastery and potential earnings.
              </p>
              <div className="mt-6">
                <Link href="/play">
                  <GlassButton className="text-sm" minWidth={220}>
                    Connect Wallet to Play
                  </GlassButton>
                </Link>
              </div>
            </div>
          </div>

          <div className="absolute top-0 left-0 right-0">
            <Image
              src="/svgs/play-and-earn-section-bg.svg"
              alt="hero-navbar-bg-color"
              width={100}
              height={100}
              className="w-full h-full"
            />
          </div>
        </motion.div>



      </section>

      {/* ─── Community / Join Section ─── */}
      <section className="w-full px-4 py-16 sm:py-24 max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: EASE }}
          className="flex flex-col items-center"
        >
          <h2 className="text-[44px] sm:text-4xl md:text-[60px] font-semibold md:font-bold leading-12.5 md:leading-15 px-10 md:px-0">
            Join 1,000+{" "}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-white to-brand-primary-200">
              Chess{" "}Players
            </span>
            <br />
            already{" "}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-white to-brand-primary-200">
              Playing on{" "} Chessdict
            </span>
          </h2>
          <p className="mt-4 text-xs sm:text-sm font-light text-white/50 max-w-md">
            Ready to Play and Earn with Chess? Connect<br className="md:hidden" /> your wallet and start competing
            on-chain.
          </p>

          {/* Social icons */}
          <div className="mt-8 flex items-center gap-4">
            {[
              { src: "/svgs/icons/discord.svg", alt: "Discord", href: CHESSDICT_SOCIALS.discord },
              { src: "/svgs/icons/x.svg", alt: "X", href: CHESSDICT_SOCIALS.x },
              { src: "/svgs/icons/telegram.svg", alt: "Telegram", href: CHESSDICT_SOCIALS.telegram },
            ].map((s) => (
              <Link
                key={s.alt}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 transition hover:bg-white/10"
              >
                <Image src={s.src} alt={s.alt} width={24} height={24} className="h-6 w-6" />
              </Link>
            ))}
          </div>
        </motion.div>

        <div className="absolute bottom-0 left-0 hidden md:block">
          <Image
            src="/svgs/community-join-section-bg-left.svg"
            alt="hero-navbar-bg-color"
            width={100}
            height={100}
            className="w-full h-full"
          />
        </div>

        <div className="absolute bottom-0 right-0 hidden md:block">
          <Image
            src="/svgs/community-join-section-bg-right.svg"
            alt="hero-navbar-bg-color"
            width={100}
            height={100}
            className="w-full h-full"
          />
        </div>

        <div className="absolute bottom-0 left-0 right-0 md:hidden">
          <Image
            src="/svgs/community-join-section-bg-mobile.svg"
            alt="community join section bg mobile"
            width={100}
            height={100}
            className="w-full h-full"
          />
        </div>

      </section>
    </div>
  );
}
