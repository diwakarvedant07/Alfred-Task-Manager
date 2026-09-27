import { describe, it, expect } from "vitest";
import {
  computeInitialTaskOffset,
  computeInitialThreadOffset,
} from "@/components/canvas/layout";

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

describe("computeInitialThreadOffset", () => {
  it("gives the first thread the origin", () => {
    expect(computeInitialThreadOffset(0)).toEqual({ x: 0, y: 0 });
  });

  it("gives distinct offsets to successive threads", () => {
    const offsets = [0, 1, 2, 3, 4].map(computeInitialThreadOffset);
    const distinct = new Set(offsets.map((o) => `${o.x},${o.y}`));
    expect(distinct.size).toBe(offsets.length);
  });
});
