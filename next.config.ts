import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prefixes every route, <Link>, redirect() and /_next asset URL.
  // Set NEXT_PUBLIC_BASE_PATH (e.g. "/ALFRED") in .env and rebuild.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  // `next dev` blocks dev assets and the HMR websocket for any origin other
  // than localhost, which breaks hydration (and so login) when the app is
  // opened via the machine's LAN IP. Dev-only; ignored by `next start`.
  allowedDevOrigins: ["192.168.1.15"],
  // Pin the workspace root explicitly: Turbopack otherwise walks up from
  // this directory looking for a lockfile and can pick up an unrelated
  // package-lock.json outside the repo (e.g. in a parent user directory).
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
