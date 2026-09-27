import { describe, it, expect } from "vitest";
import type { Node } from "@xyflow/react";
import { mergeNodes } from "@/components/canvas/mergeNodes";

const base = (id: string, x = 0): Node => ({ id, position: { x, y: 0 }, data: {} });

describe("mergeNodes", () => {
  it("keeps React Flow's measured size, so re-derived nodes aren't hidden and re-measured", () => {
    const current: Node[] = [{ ...base("a"), measured: { width: 150, height: 150 }, selected: true }];
    const [merged] = mergeNodes(current, [{ ...base("a"), data: { v: 2 } }]);
    expect(merged.measured).toEqual({ width: 150, height: 150 });
    expect(merged.selected).toBe(true);
    expect(merged.data).toEqual({ v: 2 });
  });

  it("keeps the live position of a node that's mid-drag", () => {
    const current: Node[] = [{ ...base("a", 500), dragging: true }];
    const [merged] = mergeNodes(current, [base("a", 0)]);
    expect(merged.position).toEqual({ x: 500, y: 0 });
    expect(merged.dragging).toBe(true);
  });

  it("uses the new position when not dragging, and passes new nodes through", () => {
    const merged = mergeNodes([base("a", 500)], [base("a", 10), base("b", 20)]);
    expect(merged.map((n) => n.position.x)).toEqual([10, 20]);
  });
});
