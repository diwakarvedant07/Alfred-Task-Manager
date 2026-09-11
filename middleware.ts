export { auth as middleware } from "@/lib/auth";

// lib/auth.ts pulls in Prisma's pg driver adapter (Node-only APIs like
// `tls`), which is not compatible with the default Edge middleware runtime.
// Node.js middleware is a stable option here, so opt into it explicitly.
export const runtime = "nodejs";

export const config = {
  matcher: ["/canvas/:path*", "/recycle-bin/:path*"],
};
