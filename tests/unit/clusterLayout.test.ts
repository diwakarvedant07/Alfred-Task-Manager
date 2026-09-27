import { describe, it, expect } from "vitest";
import {
  clusterLayout,
  ADD_SLOT_ID,
  CENTER_RADIUS,
  BUBBLE_GAP,
  PRIORITY_RADIUS,
  type ClusterTaskInput,
} from "@/components/canvas/clusterLayout";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
const STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const;

function makeTasks(n: number): ClusterTaskInput[] {
  // Deterministic spread of priorities/statuses, no randomness.
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    title: `Task ${String(i).padStart(2, "0")}`,
    priority: PRIORITIES[(i * 7) % 3],
    workStatus: STATUSES[(i * 5) % 3],
  }));
}

describe("clusterLayout", () => {
  it("returns just the center radius for no tasks and no add slot", () => {
    expect(clusterLayout([], { includeAddSlot: false })).toEqual({ bubbles: [], radius: CENTER_RADIUS });
  });

  it("places only the add slot for an empty thread when requested", () => {
    const { bubbles } = clusterLayout([], { includeAddSlot: true });
    expect(bubbles.map((b) => b.id)).toEqual([ADD_SLOT_ID]);
  });

  it("sizes bubbles by priority", () => {
    const { bubbles } = clusterLayout(
      [
        { id: "h", title: "a", priority: "HIGH", workStatus: "TODO" },
        { id: "m", title: "b", priority: "MEDIUM", workStatus: "TODO" },
        { id: "l", title: "c", priority: "LOW", workStatus: "TODO" },
      ],
      { includeAddSlot: false }
    );
    const r = Object.fromEntries(bubbles.map((b) => [b.id, b.r]));
    expect(r).toEqual({ h: PRIORITY_RADIUS.HIGH, m: PRIORITY_RADIUS.MEDIUM, l: PRIORITY_RADIUS.LOW });
  });

  it.each([1, 3, 7, 12, 25, 50])("never overlaps bubbles or the center with %i tasks", (n) => {
    const { bubbles, radius } = clusterLayout(makeTasks(n), { includeAddSlot: true });
    for (const b of bubbles) {
      expect(Math.hypot(b.x, b.y)).toBeGreaterThanOrEqual(CENTER_RADIUS + b.r + BUBBLE_GAP - 1e-6);
      expect(Math.hypot(b.x, b.y) + b.r).toBeLessThanOrEqual(radius + 1e-6);
    }
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const a = bubbles[i];
        const b = bubbles[j];
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r + BUBBLE_GAP - 1e-6);
      }
    }
  });

  it("orders unfinished tasks HIGH → MEDIUM → LOW, then by title", () => {
    const tasks: ClusterTaskInput[] = [
      { id: "l", title: "Zed", priority: "LOW", workStatus: "TODO" },
      { id: "m2", title: "Beta", priority: "MEDIUM", workStatus: "IN_PROGRESS" },
      { id: "h", title: "Omega", priority: "HIGH", workStatus: "TODO" },
      { id: "m1", title: "Alpha", priority: "MEDIUM", workStatus: "TODO" },
    ];
    const ids = clusterLayout(tasks, { includeAddSlot: false }).bubbles.map((b) => b.id);
    expect(ids).toEqual(["h", "m1", "m2", "l"]);
  });

  it("puts DONE tasks on rings strictly outside every unfinished task and the add slot", () => {
    const { bubbles } = clusterLayout(makeTasks(30), { includeAddSlot: true });
    const doneIds = new Set(makeTasks(30).filter((t) => t.workStatus === "DONE").map((t) => t.id));
    const doneRings = bubbles.filter((b) => doneIds.has(b.id)).map((b) => b.ring);
    const otherRings = bubbles.filter((b) => !doneIds.has(b.id)).map((b) => b.ring);
    expect(Math.min(...doneRings)).toBeGreaterThan(Math.max(...otherRings));
  });

  it("places the add slot after the last unfinished task", () => {
    const ids = clusterLayout(
      [
        { id: "d", title: "x", priority: "HIGH", workStatus: "DONE" },
        { id: "t", title: "y", priority: "LOW", workStatus: "TODO" },
      ],
      { includeAddSlot: true }
    ).bubbles.map((b) => b.id);
    expect(ids).toEqual(["t", ADD_SLOT_ID, "d"]);
  });

  it("starts the first ring at the top (negative y, x ≈ 0) for a single task", () => {
    const [b] = clusterLayout([{ id: "a", title: "a", priority: "LOW", workStatus: "TODO" }], {
      includeAddSlot: false,
    }).bubbles;
    expect(b.x).toBeCloseTo(0);
    expect(b.y).toBeLessThan(0);
  });
});
