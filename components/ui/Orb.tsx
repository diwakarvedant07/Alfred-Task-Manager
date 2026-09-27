"use client";

import { ThinkingOrb } from "thinking-orbs";
import type { CSSProperties } from "react";

export type OrbState =
  | "working"
  | "searching"
  | "solving"
  | "listening"
  | "connecting"
  | "weaving"
  | "composing"
  | "breathing"
  | "shaping";

// thinking-orbs ships exactly two hand-tuned presets (20 and 64px) — any
// other display size is the nearest preset scaled with CSS, so the dot
// density stays as designed.
function presetFor(size: number): 20 | 64 {
  return size <= 32 ? 20 : 64;
}

/**
 * Animated dotted "thinking" orb (thinking-orbs) sitting on a soft
 * accent-tinted halo. The dots themselves are monochrome and follow
 * <html data-theme>; the halo is what ties them to the user's accent color.
 * Used only for AI/Jarvis states so the motion keeps a consistent meaning.
 */
export default function Orb({
  state = "breathing",
  size = 20,
  halo = true,
  speed,
  paused,
  label,
  className = "",
}: {
  state?: OrbState;
  size?: number;
  halo?: boolean;
  speed?: number;
  paused?: boolean;
  // Decorative by default; pass a label when the orb is the only thing
  // conveying a state (e.g. a loading indicator with no visible text).
  label?: string;
  className?: string;
}) {
  const preset = presetFor(size);
  const scale = size / preset;
  const canvasStyle: CSSProperties =
    scale === 1 ? {} : { transform: `scale(${scale})`, transformOrigin: "center" };

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      {halo && (
        <span
          aria-hidden
          className="absolute inset-[-18%] rounded-full blur-md"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--accent) 45%, transparent) 0%, transparent 70%)",
          }}
        />
      )}
      <ThinkingOrb
        state={state}
        size={preset}
        speed={speed}
        paused={paused}
        aria-hidden
        style={canvasStyle}
        className="relative"
      />
    </span>
  );
}
