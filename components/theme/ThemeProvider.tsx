"use client";

import { useEffect } from "react";
import { themeToCssVariables } from "@/lib/theme";

export default function ThemeProvider({
  themeMode,
  accentColor,
  children,
}: {
  themeMode: "LIGHT" | "DARK";
  accentColor: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const vars = themeToCssVariables(themeMode, accentColor);
    for (const [key, value] of Object.entries(vars)) {
      document.documentElement.style.setProperty(key, value);
    }
  }, [themeMode, accentColor]);

  return <>{children}</>;
}
