export function themeToCssVariables(
  themeMode: "LIGHT" | "DARK",
  accentColor: string
): Record<string, string> {
  const isDark = themeMode === "DARK";
  return {
    "--accent": accentColor,
    "--bg": isDark ? "#0a0e14" : "#f5f7fa",
    "--panel-bg": isDark ? "rgba(15,25,35,0.85)" : "rgba(255,255,255,0.85)",
    "--text": isDark ? "#eafcff" : "#0a0e14",
    "--glow-opacity": isDark ? "0.25" : "0.12",
  };
}
