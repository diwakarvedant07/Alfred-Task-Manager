"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export type LauncherOrigin = { x: number; y: number };

const LAUNCHER_RADIUS = 28;
const EASE = [0.22, 1, 0.36, 1] as const; // --ease-out-soft
const REVEAL_S = 0.45;

// Grows the Jarvis workspace out of the launcher button: a circular
// clip-path centred on the button expands to cover the viewport (and
// shrinks back into it on exit). A solid backdrop layer is revealed first,
// and the workspace content fades in over the last third so no text is
// visible while it's still being clipped. The launcher's orb and the chat
// header's orb share layoutId "jarvis-orb", so the orb itself flies between
// them. Must be a keyed direct child of <AnimatePresence>.
export default function JarvisLauncherTransition({
  origin,
  children,
}: {
  // Centre of the launcher in viewport pixels; null falls back to the
  // launcher's usual bottom-right corner.
  origin: LauncherOrigin | null;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const at = origin ? `${origin.x}px ${origin.y}px` : "calc(100% - 48px) calc(100% - 48px)";
  const full = typeof window === "undefined" ? 4000 : Math.ceil(Math.hypot(window.innerWidth, window.innerHeight));
  const closed = `circle(${LAUNCHER_RADIUS}px at ${at})`;
  const opened = `circle(${full}px at ${at})`;

  // pointer-events: the full-viewport wrapper must not swallow clicks
  // meant for the canvas strip; only the workspace itself is interactive.
  const wrapperClass = "pointer-events-none fixed inset-0 z-[110] [&>*]:pointer-events-auto";

  if (reduced) {
    return (
      <motion.div
        data-testid="jarvis-launch-transition"
        data-origin={at}
        className={wrapperClass}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      data-testid="jarvis-launch-transition"
      data-origin={at}
      className="pointer-events-none fixed inset-0 z-[110]"
      style={{ clipPath: closed }}
      initial={{ clipPath: closed }}
      animate={{ clipPath: opened }}
      exit={{ clipPath: closed }}
      transition={{ duration: REVEAL_S, ease: EASE }}
    >
      <div aria-hidden className="absolute inset-0 bg-canvas md:right-[max(38%,360px)]" />
      <motion.div
        className={wrapperClass}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: REVEAL_S * (2 / 3), duration: REVEAL_S / 3 } }}
        exit={{ opacity: 0, transition: { duration: 0.1 } }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
