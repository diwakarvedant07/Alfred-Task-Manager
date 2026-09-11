import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root explicitly: Turbopack otherwise walks up from
  // this directory looking for a lockfile and can pick up an unrelated
  // package-lock.json outside the repo (e.g. in a parent user directory).
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
