'use client';

import { Hero } from "../components/hero";
import { Footer } from "../components/footer";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-black text-white bg-[url('/images/chess_bg.svg')] bg-cover bg-center">
      <Hero />
      <Footer />
    </main>
  );
}
