import { describe, it, expect } from "vitest";
import { isThreadStale, STALE_THRESHOLD_MS } from "@/lib/threadStaleness";

describe("isThreadStale", () => {
  const now = new Date("2026-03-01T00:00:00Z");

  it("is false when never viewed before", () => {
    expect(isThreadStale(null, now)).toBe(false);
  });

  it("is false at exactly the 24-hour threshold", () => {
    const lastViewedAt = new Date(now.getTime() - STALE_THRESHOLD_MS);
    expect(isThreadStale(lastViewedAt, now)).toBe(false);
  });

  it("is true just past the 24-hour threshold", () => {
    const lastViewedAt = new Date(now.getTime() - STALE_THRESHOLD_MS - 1);
    expect(isThreadStale(lastViewedAt, now)).toBe(true);
  });

  it("is false for a view an hour ago", () => {
    const lastViewedAt = new Date(now.getTime() - 60 * 60 * 1000);
    expect(isThreadStale(lastViewedAt, now)).toBe(false);
  });
});
