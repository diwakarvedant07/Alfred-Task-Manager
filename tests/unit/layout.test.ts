import { describe, it, expect } from "vitest";
import { computeThreadCentroid, computeInitialTaskOffset } from "@/components/canvas/layout";

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

describe("computeInitialTaskOffset", () => {
  it("gives the first task in a thread the origin", () => {
    expect(computeInitialTaskOffset(0)).toEqual({ x: 0, y: 0 });
  });

  it("gives distinct offsets to successive tasks in the same thread", () => {
    const offsets = [0, 1, 2, 3, 4].map(computeInitialTaskOffset);
    const distinct = new Set(offsets.map((o) => `${o.x},${o.y}`));
    expect(distinct.size).toBe(offsets.length);
  });

  it("is deterministic for a given index", () => {
    expect(computeInitialTaskOffset(2)).toEqual(computeInitialTaskOffset(2));
  });
});
