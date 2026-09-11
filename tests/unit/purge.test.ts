import { describe, it, expect } from "vitest";
import { isPastPurgeThreshold, PURGE_THRESHOLD_DAYS } from "@/lib/purge";

describe("isPastPurgeThreshold", () => {
  const now = new Date("2026-03-01T00:00:00Z");

  it(`is false exactly at ${PURGE_THRESHOLD_DAYS} days`, () => {
    const deletedAt = new Date(now.getTime() - PURGE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
    expect(isPastPurgeThreshold(deletedAt, now)).toBe(false);
  });

  it(`is true just past ${PURGE_THRESHOLD_DAYS} days`, () => {
    const deletedAt = new Date(now.getTime() - (PURGE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000 + 1));
    expect(isPastPurgeThreshold(deletedAt, now)).toBe(true);
  });

  it("is false for something deleted yesterday", () => {
    const deletedAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    expect(isPastPurgeThreshold(deletedAt, now)).toBe(false);
  });
});
