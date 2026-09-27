import { userAgentFromString } from "next/server";
import type { DeviceInfo } from "./viewport";

type HeaderReader = { get(name: string): string | null };

// Server-side guess at the device from the incoming request, so the first
// HTML response is already in the right layout instead of rendering the
// desktop one and switching after hydration.
export function detectDevice(headers: HeaderReader, viewportCookie: string | undefined): DeviceInfo {
  const uaHeader = headers.get("user-agent");
  // Only parse a real header: given nothing, the parser falls back to the
  // runtime's own navigator.userAgent, which describes the server.
  const ua = uaHeader ? userAgentFromString(uaHeader) : null;
  const os = ua?.os.name ?? null;
  const browser = ua?.browser.name ?? null;

  if (viewportCookie === "mobile" || viewportCookie === "desktop") {
    return { type: viewportCookie, os, browser, source: "cookie" };
  }

  // Chromium browsers send this low-entropy client hint on every request.
  const mobileHint = headers.get("sec-ch-ua-mobile");
  if (mobileHint === "?1" || mobileHint === "?0") {
    return { type: mobileHint === "?1" ? "mobile" : "desktop", os, browser, source: "client-hint" };
  }

  const deviceType = ua?.device.type;
  const type = deviceType === "mobile" ? "mobile" : deviceType === "tablet" ? "tablet" : "desktop";
  return { type, os, browser, source: "user-agent" };
}
