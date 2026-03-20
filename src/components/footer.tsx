"use client";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative z-10 flex w-full justify-center px-6 py-8">
      <p className="text-sm text-white/40">&copy; {year} Chessdict Foundation</p>
    </footer>
  );
}
