"use client";

import { GameBoard } from "../../components/game/game-board";
import { GameOptions } from "../../components/game/game-options";


export default function PlayPage() {
  return (
    <main className="flex min-h-screen flex-col bg-black text-white">
     

      {/* Main Content */}
      <div className="container mx-auto flex flex-1 gap-6 px-6 pt-32 pb-6">
        {/* Left Panel - Chess Board */}
        <div className="flex flex-1 flex-col items-center justify-start">
          <GameBoard />
        </div>

        {/* Right Panel - Game Options */}
        <div className="w-full max-w-md">
          <GameOptions />
        </div>
      </div>
    </main>
  );
}

