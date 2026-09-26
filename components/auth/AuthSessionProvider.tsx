"use client";

import { SessionProvider } from "next-auth/react";
import { BASE_PATH } from "@/lib/basePath";

// next-auth/react's signIn()/signOut() default to "/api/auth" and don't know
// about next.config's basePath; SessionProvider's basePath prop is how the
// client is pointed at the prefixed route (e.g. /ALFRED/api/auth).
export default function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider basePath={`${BASE_PATH}/api/auth`}>{children}</SessionProvider>;
}
