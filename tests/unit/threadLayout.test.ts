import { describe, it, expect } from "vitest";
import { defaultThreadPosition, clustersOverlap, cameraZoomForCluster } from "@/components/canvas/threadLayout";

describe("defaultThreadPosition", () => {
  it("lays threads out on a 3-column grid, 520 units apart", () => {
    expect(defaultThreadPosition(0)).toEqual({ x: 0, y: 0 });
    expect(defaultThreadPosition(2)).toEqual({ x: 1040, y: 0 });
    expect(defaultThreadPosition(3)).toEqual({ x: 0, y: 520 });
  });
});

describe("clustersOverlap", () => {
  it("is true only when the circles intersect", () => {
    expect(clustersOverlap({ x: 0, y: 0, r: 100 }, { x: 150, y: 0, r: 75 })).toBe(true);
    expect(clustersOverlap({ x: 0, y: 0, r: 100 }, { x: 200, y: 0, r: 75 })).toBe(false);
  });
});

describe("cameraZoomForCluster", () => {
  const viewport = { width: 1000, height: 800 };
  // fit = 800 / (2 * (152 + 48)) = 2 → target capped at 1.2
  it("keeps the current zoom when the cluster already fits and is readable", () => {
    expect(cameraZoomForCluster(1, viewport, 152, 48)).toBe(1);
  });
  it("zooms in to a readable level when currently zoomed far out", () => {
    expect(cameraZoomForCluster(0.3, viewport, 152, 48)).toBe(1.2);
  });
  it("zooms out when the cluster doesn't fit at the current zoom", () => {
    // fit = 800 / (2 * (352 + 48)) = 1
    expect(cameraZoomForCluster(1.5, viewport, 352, 48)).toBe(1);
  });
});
