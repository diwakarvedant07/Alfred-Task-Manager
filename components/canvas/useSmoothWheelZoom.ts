"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useReactFlow, type Viewport } from "@xyflow/react";

// React Flow's own wheel zoom multiplies pinch gestures (ctrl+wheel) by 10
// only on macOS, so a Windows trackpad pinch zoomed ~0.4% per event and felt
// like hard work; it also jumps straight to each new zoom. This replaces it
// (the canvas passes zoomOnScroll/zoomOnPinch = false to React Flow) with a
// pinch boost on every OS and an eased zoom toward the target.

const PINCH_BOOST = 10;
const WHEEL_BOOST = 1.5;
// Fraction of the remaining distance covered each frame.
const EASE_PER_FRAME = 0.3;
const SNAP_EPSILON = 0.001;

export function wheelZoomFactor(e: { deltaY: number; deltaMode: number; ctrlKey: boolean }): number {
  const base = e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002;
  return 2 ** (-e.deltaY * base * (e.ctrlKey ? PINCH_BOOST : WHEEL_BOOST));
}

// Viewport at `zoom` that keeps the flow point under `anchor` (container
// pixels) where it is on screen.
export function zoomAround(vp: Viewport, anchor: { x: number; y: number }, zoom: number): Viewport {
  const flowX = (anchor.x - vp.x) / vp.zoom;
  const flowY = (anchor.y - vp.y) / vp.zoom;
  return { x: anchor.x - flowX * zoom, y: anchor.y - flowY * zoom, zoom };
}

export function stepZoom(current: number, target: number): number {
  const next = current + (target - current) * EASE_PER_FRAME;
  return Math.abs(target - next) < SNAP_EPSILON ? target : next;
}

export function useSmoothWheelZoom(
  containerRef: RefObject<HTMLElement | null>,
  { minZoom, maxZoom, reducedMotion }: { minZoom: number; maxZoom: number; reducedMotion: boolean }
) {
  const { getViewport, setViewport } = useReactFlow();
  const target = useRef<number | null>(null);
  const anchor = useRef({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function stop() {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      target.current = null;
    }

    function tick() {
      const vp = getViewport();
      const goal = target.current;
      if (goal === null) return stop();
      const zoom = stepZoom(vp.zoom, goal);
      void setViewport(zoomAround(vp, anchor.current, zoom));
      if (zoom === goal) return stop();
      frame.current = requestAnimationFrame(tick);
    }

    function handleWheel(e: WheelEvent) {
      if ((e.target as Element | null)?.closest?.(".nowheel")) return;
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      anchor.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const from = target.current ?? getViewport().zoom;
      const goal = Math.min(maxZoom, Math.max(minZoom, from * wheelZoomFactor(e)));
      if (reducedMotion) {
        void setViewport(zoomAround(getViewport(), anchor.current, goal));
        return;
      }
      target.current = goal;
      if (frame.current === null) frame.current = requestAnimationFrame(tick);
    }

    // A drag-to-pan takes over from any zoom still easing in.
    el.addEventListener("wheel", handleWheel, { passive: false });
    el.addEventListener("pointerdown", stop);
    return () => {
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("pointerdown", stop);
      stop();
    };
  }, [containerRef, getViewport, setViewport, minZoom, maxZoom, reducedMotion]);
}
