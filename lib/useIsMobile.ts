"use client";

import { useSyncExternalStore } from "react";

// Matches Tailwind's `sm` breakpoint: below it the sidebar rail is hidden
// and the app switches to its phone layout.
const MOBILE_QUERY = "(max-width: 639px)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  // jsdom (component tests) has no matchMedia — treat it as desktop.
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

export function useIsMobile(): boolean {
  // The server can't know the viewport, so it renders the desktop layout;
  // phones switch over during hydration.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
