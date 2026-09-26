import { themeToCssVariables } from "@/lib/theme";

// Shared by ThemeProvider (initial/refreshed server props) and UserMenu
// (instant preview before the Server Action round-trip). Besides the CSS
// variables, it mirrors the mode onto <html data-theme> — that's what
// ThinkingOrb's theme="auto" and the light/dark CSS overrides in
// app/globals.css read.
export function applyThemeToDocument(themeMode: "LIGHT" | "DARK", accentColor: string) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(themeToCssVariables(themeMode, accentColor))) {
    root.style.setProperty(key, value);
  }
  root.dataset.theme = themeMode === "DARK" ? "dark" : "light";
  root.style.colorScheme = themeMode === "DARK" ? "dark" : "light";
}
