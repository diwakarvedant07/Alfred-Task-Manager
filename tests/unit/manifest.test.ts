import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("PWA manifest", () => {
  it("is valid JSON with the fields required for installability", () => {
    const raw = fs.readFileSync(path.resolve(__dirname, "../../public/manifest.json"), "utf-8");
    const manifest = JSON.parse(raw);

    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe("/canvas");
    expect(manifest.display).toBe("standalone");
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });
});
