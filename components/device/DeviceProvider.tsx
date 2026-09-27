"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { MOBILE_QUERY, VIEWPORT_COOKIE, type DeviceInfo } from "@/lib/viewport";
import { BASE_PATH } from "@/lib/basePath";

const DEFAULT_DEVICE: DeviceInfo = { type: "desktop", os: null, browser: null, source: "user-agent" };

const DeviceContext = createContext<DeviceInfo>(DEFAULT_DEVICE);

// The device info detected from the first request (app/layout.tsx), kept
// available to any client component via useDevice().
export function useDevice(): DeviceInfo {
  return useContext(DeviceContext);
}

export default function DeviceProvider({ device, children }: { device: DeviceInfo; children: ReactNode }) {
  // The request headers only give a guess (a phone-sized desktop window or
  // a large phone can disagree with them). Record the real viewport so the
  // next request is rendered from the cookie instead of the guess, and keep
  // it current if the window is resized across the breakpoint.
  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia(MOBILE_QUERY);
    function record() {
      const value = mql.matches ? "mobile" : "desktop";
      document.cookie = `${VIEWPORT_COOKIE}=${value}; path=${BASE_PATH || "/"}; max-age=31536000; samesite=lax`;
    }
    record();
    mql.addEventListener("change", record);
    return () => mql.removeEventListener("change", record);
  }, []);

  // Mobile browsers don't shrink the page when the on-screen keyboard (or,
  // on some, the toolbars) cover part of it — only the *visual* viewport
  // shrinks. Mirror it into CSS variables so full-screen overlays
  // (.fit-visible-viewport in app/globals.css) can size themselves to the
  // part of the screen actually visible, keeping inputs and their buttons
  // above the keyboard instead of behind it.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let frame = 0;
    function sync() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty("--vvh", `${vv!.height}px`);
        root.style.setProperty("--vv-top", `${vv!.offsetTop}px`);
      });
    }
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vv-top");
    };
  }, []);

  return <DeviceContext.Provider value={device}>{children}</DeviceContext.Provider>;
}
