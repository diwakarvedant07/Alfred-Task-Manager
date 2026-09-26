"use client";

import { useEffect } from "react";
import { applyThemeToDocument } from "@/lib/applyTheme";

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
    applyThemeToDocument(themeMode, accentColor);
  }, [themeMode, accentColor]);

  return <>{children}</>;
}
