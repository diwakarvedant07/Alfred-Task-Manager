import { describe, it, expect } from "vitest";
import { getZoomTier, ZOOM_TIER_THRESHOLD } from "@/components/canvas/zoomTier";

describe("getZoomTier", () => {
  it("returns BUBBLE below the threshold and CARD at or above it", () => {
    expect(getZoomTier(ZOOM_TIER_THRESHOLD - 0.01)).toBe("BUBBLE");
    expect(getZoomTier(ZOOM_TIER_THRESHOLD)).toBe("CARD");
    expect(getZoomTier(1.5)).toBe("CARD");
  });
});
