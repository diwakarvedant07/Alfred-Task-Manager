import { describe, it, expect } from "vitest";
import { themeToCssVariables, onAccentColor } from "@/lib/theme";

describe("themeToCssVariables", () => {
  it("uses the full-strength accent color and a black base in dark mode", () => {
    const vars = themeToCssVariables("DARK", "#38e0ff");
    expect(vars["--accent"]).toBe("#38e0ff");
    expect(vars["--bg"]).toBe("#0a0e14");
    expect(vars["--glow-opacity"]).toBe("0.25");
  });

  it("keeps the same accent color but a bright base and softer glow in light mode", () => {
    const vars = themeToCssVariables("LIGHT", "#38e0ff");
    expect(vars["--accent"]).toBe("#38e0ff");
    expect(vars["--bg"]).toBe("#f5f7fa");
    expect(vars["--glow-opacity"]).toBe("0.12");
  });

  it("passes through any user-chosen hex color unchanged", () => {
    const vars = themeToCssVariables("DARK", "#ff5fa8");
    expect(vars["--accent"]).toBe("#ff5fa8");
  });
});

describe("onAccentColor", () => {
  it("picks dark text on light accents and white text on dark accents", () => {
    expect(onAccentColor("#38e0ff")).toBe("#04121a");
    expect(onAccentColor("#fde047")).toBe("#04121a");
    expect(onAccentColor("#4f46e5")).toBe("#ffffff");
    expect(onAccentColor("#7c2d12")).toBe("#ffffff");
  });

  it("falls back to dark text for a value that isn't a 6-digit hex", () => {
    expect(onAccentColor("not-a-color")).toBe("#04121a");
  });
});
