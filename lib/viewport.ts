// Shared by the server-side device detection (lib/device.ts) and the
// client hooks — kept free of server-only imports so it's safe in both.

// Matches Tailwind's `sm` breakpoint: below it the sidebar rail is hidden
// and the app switches to its phone layout.
export const MOBILE_QUERY = "(max-width: 639px)";

// Written by DeviceProvider once the browser knows its real viewport width,
// so every request after the first renders the right layout exactly.
export const VIEWPORT_COOKIE = "arc-viewport";

export type DeviceInfo = {
  // "mobile" gets the phone layout (list view, bottom sheets); tablets are
  // wide enough for the desktop canvas.
  type: "mobile" | "tablet" | "desktop";
  os: string | null;
  browser: string | null;
  // Where `type` came from, most to least reliable.
  source: "cookie" | "client-hint" | "user-agent";
};
