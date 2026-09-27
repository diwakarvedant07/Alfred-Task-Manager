"use client";

import type { Ref } from "react";
import { motion } from "framer-motion";
import Orb from "@/components/ui/Orb";

// Floating launcher for the Jarvis workspace: a live "breathing" orb that
// reads as "your AI is here", with a label that slides out on hover.
export default function JarvisPanel({
  onOpen,
  shifted = false,
  buttonRef,
}: {
  onOpen: () => void;
  // Moves the launcher left of the task-detail rail while that's open.
  shifted?: boolean;
  // Lets the canvas read the launcher's position so the Jarvis
  // workspace can grow out of it (also used by the "J" shortcut).
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      aria-label="Jarvis"
      title="Ask Jarvis (J)"
      onClick={onOpen}
      className="glass elevated group fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 flex h-14 animate-pop-in items-center gap-0 overflow-hidden rounded-full pl-[9px] pr-[9px] text-fg outline-none transition-all duration-300 ease-[var(--ease-out-soft)] hover:gap-2.5 hover:pr-5 focus-visible:gap-2.5 focus-visible:pr-5 ring-1 ring-accent/25 hover:ring-accent/50 focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-95"
      style={{
        right: shifted
          ? "calc(min(380px, 100% - 24px) + 32px + env(safe-area-inset-right))"
          : "calc(20px + env(safe-area-inset-right))",
      }}
    >
      <motion.span layoutId="jarvis-orb" className="inline-flex">
        <Orb state="breathing" size={36} />
      </motion.span>
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium opacity-0 transition-all duration-300 group-hover:max-w-[120px] group-hover:opacity-100 group-focus-visible:max-w-[120px] group-focus-visible:opacity-100">
        Ask Jarvis
        <kbd className="ml-2 rounded border border-fg/15 px-1 font-mono text-[10px] text-fg/50">J</kbd>
      </span>
    </button>
  );
}
