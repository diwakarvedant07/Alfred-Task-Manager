import { describe, it, expect } from "vitest";
import { computeThreadCentroid } from "@/components/canvas/layout";

describe("computeThreadCentroid", () => {
  it("averages positions of all tasks in a thread", () => {
    const centroid = computeThreadCentroid([
      { positionX: 0, positionY: 0 },
      { positionX: 100, positionY: 200 },
    ]);
    expect(centroid).toEqual({ x: 50, y: 100 });
  });

  it("returns the origin for an empty thread", () => {
    expect(computeThreadCentroid([])).toEqual({ x: 0, y: 0 });
  });
});
