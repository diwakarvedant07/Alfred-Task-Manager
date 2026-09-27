"use client";

import { useRef } from "react";
import type React from "react";

const MOVE_TOLERANCE_PX = 8;

// Long-press (touch/mouse hold) or right-click opens a context menu. A
// pointer that moves more than a few pixels is a drag (of the thread
// node), not a press. The click that ends a long press is swallowed via
// consumeLongPress() so it doesn't also activate the element.
export function useLongPress(onLongPress: () => void, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  function clear() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }

  return {
    handlers: {
      onPointerDown(e: React.PointerEvent) {
        if (e.button !== 0) return;
        clear();
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        timer.current = setTimeout(() => {
          fired.current = true;
          timer.current = null;
          onLongPress();
        }, ms);
      },
      onPointerMove(e: React.PointerEvent) {
        if (!start.current) return;
        if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > MOVE_TOLERANCE_PX) clear();
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      onContextMenu(e: React.MouseEvent) {
        e.preventDefault();
        clear();
        fired.current = true;
        onLongPress();
      },
    },
    consumeLongPress() {
      const wasLongPress = fired.current;
      fired.current = false;
      return wasLongPress;
    },
  };
}
