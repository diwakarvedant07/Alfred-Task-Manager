import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import ThemeProvider from "@/components/theme/ThemeProvider";

describe("ThemeProvider", () => {
  it("applies theme CSS variables to the document root", () => {
    render(
      <ThemeProvider themeMode="DARK" accentColor="#38e0ff">
        <div>content</div>
      </ThemeProvider>
    );

    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#38e0ff");
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe("#0a0e14");
  });
});
