import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/pwa/ServiceWorkerRegistration";
import ThemeProvider from "@/components/theme/ThemeProvider";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { themeToCssVariables } from "@/lib/theme";
import { BASE_PATH } from "@/lib/basePath";
import AuthSessionProvider from "@/components/auth/AuthSessionProvider";
import DeviceProvider from "@/components/device/DeviceProvider";
import { cookies, headers } from "next/headers";
import { detectDevice } from "@/lib/device";
import { VIEWPORT_COOKIE } from "@/lib/viewport";

// Matches the Prisma User model's own defaults (prisma/schema.prisma:
// themeMode DARK, accentColor #38e0ff) — used for logged-out routes like
// /login and /signup, which have no user record to read a preference from.
const DEFAULT_THEME_MODE = "DARK" as const;
const DEFAULT_ACCENT_COLOR = "#38e0ff";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Arc", template: "%s · Arc" },
  description: "Arc — a thread-based task canvas with Jarvis, your AI copilot.",
};

export const viewport: Viewport = {
  themeColor: "#0a0e14",
  // Lets the app draw under the notch/home indicator when installed as a
  // PWA; the navbar and bottom-anchored controls pad themselves with
  // env(safe-area-inset-*) to stay clear of them.
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // ThemeProvider needs to cover the whole authenticated app (not just
  // /canvas) so /recycle-bin and the auth pages are themed too. There's no
  // user session on /login or /signup (and auth() can resolve with no user
  // at all), so this falls back to the schema's own defaults instead of
  // crashing or leaving those pages unthemed.
  let themeMode: "LIGHT" | "DARK" = DEFAULT_THEME_MODE;
  let accentColor = DEFAULT_ACCENT_COLOR;

  // Detected from the request itself so the first HTML response already
  // has the phone or desktop layout (see components/device/DeviceProvider).
  const device = detectDevice(await headers(), (await cookies()).get(VIEWPORT_COOKIE)?.value);

  const session = await auth();
  if (session?.user?.id) {
    const user = await db.user.findUnique({ where: { id: session.user.id } });
    if (user) {
      themeMode = user.themeMode;
      accentColor = user.accentColor;
    }
  }

  return (
    <html
      lang="en"
      // Theme variables and data-theme are rendered server-side (not only
      // by ThemeProvider's effect) so the first paint already uses the
      // user's colors instead of flashing the CSS fallbacks.
      data-theme={themeMode === "DARK" ? "dark" : "light"}
      style={{ ...themeToCssVariables(themeMode, accentColor), colorScheme: themeMode === "DARK" ? "dark" : "light" }}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="manifest" href={`${BASE_PATH}/manifest.json`} />
      </head>
      <body className="flex h-full min-h-full flex-col">
        <AuthSessionProvider>
          <DeviceProvider device={device}>
            <ThemeProvider themeMode={themeMode} accentColor={accentColor}>
              {children}
            </ThemeProvider>
          </DeviceProvider>
        </AuthSessionProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
