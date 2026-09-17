"use client";

import { Sparkles } from "lucide-react";

export default function JarvisPanel({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      aria-label="Jarvis"
      onClick={onOpen}
      className="fixed bottom-4 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent,#38e0ff)] text-[#04121a] shadow-2xl transition-transform hover:scale-105"
    >
      <Sparkles size={22} />
    </button>
  );
}
