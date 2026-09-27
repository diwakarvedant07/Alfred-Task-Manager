"use client";

import { useSyncExternalStore } from "react";
import { useDevice } from "@/components/device/DeviceProvider";
import { MOBILE_QUERY } from "./viewport";

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
  // The server can't measure the viewport, so the server render (and
  // hydration, which must match it) uses the device detected from the
  // request headers; the live media query takes over after hydration.
  const device = useDevice();
  return useSyncExternalStore(subscribe, getSnapshot, () => device.type === "mobile");
}
