// Readable text color for content drawn on top of an --accent fill. The
// accent is user-chosen, so this has to follow the accent's own lightness
// rather than the light/dark mode.
export function onAccentColor(accentColor: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(accentColor.trim());
  if (!match) return "#04121a";
  const n = parseInt(match[1], 16);
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel((n >> 16) & 0xff) + 0.7152 * channel((n >> 8) & 0xff) + 0.0722 * channel(n & 0xff);
  return luminance > 0.3 ? "#04121a" : "#ffffff";
}

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
    // Opaque raised surface (cards, menus, inputs) — --panel-bg is
    // translucent, so stacked/overlapping elements bled through each other.
    "--surface": isDark ? "#111a24" : "#ffffff",
    "--on-accent": onAccentColor(accentColor),
  };
}
