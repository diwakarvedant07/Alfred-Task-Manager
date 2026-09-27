export type Priority = "LOW" | "MEDIUM" | "HIGH";
export type WorkStatus = "TODO" | "IN_PROGRESS" | "DONE";
export type ClusterTaskInput = { id: string; title: string; priority: Priority; workStatus: WorkStatus };
export type ClusterBubble = { id: string; x: number; y: number; r: number; ring: number };
export type ClusterLayout = { bubbles: ClusterBubble[]; radius: number };

// Pseudo-task id for the "+ Add task" bubble at the end of the unfinished tasks.
export const ADD_SLOT_ID = "__add__";
// The × bubble at the cluster's center (52px hit area).
export const CENTER_RADIUS = 26;
// Minimum clear space between any two bubbles' edges.
export const BUBBLE_GAP = 6;
export const PRIORITY_RADIUS: Record<Priority, number> = { HIGH: 34, MEDIUM: 29, LOW: 24 };
const ADD_SLOT_RADIUS = 24;
const PRIORITY_ORDER: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

type Item = { id: string; r: number };

function byPriorityThenTitle(a: ClusterTaskInput, b: ClusterTaskInput) {
  return (
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    a.title.localeCompare(b.title) ||
    a.id.localeCompare(b.id)
  );
}

// Angular width a bubble of radius r occupies on a ring of radius R,
// including half the gap on each side. Two neighbours separated by the
// sum of their half-widths are at least r1 + r2 + BUBBLE_GAP apart
// (2·sin((A+B)/2) ≥ sin A + sin B for A, B in [0, π/2]).
function angularWidth(r: number, R: number) {
  return 2 * Math.asin(Math.min(1, (r + BUBBLE_GAP / 2) / R));
}

/**
 * Packs a thread's tasks into concentric rings around the center × bubble.
 * Each group (unfinished + add slot, then DONE) starts on a fresh ring, so
 * DONE tasks always sit outside everything else. Each ring's radius clears
 * the previous ring's outer edge by BUBBLE_GAP, and bubbles on a ring are
 * spread evenly around it, starting at the top.
 */
export function clusterLayout(tasks: ClusterTaskInput[], opts: { includeAddSlot: boolean }): ClusterLayout {
  const unfinished: Item[] = tasks
    .filter((t) => t.workStatus !== "DONE")
    .sort(byPriorityThenTitle)
    .map((t) => ({ id: t.id, r: PRIORITY_RADIUS[t.priority] }));
  if (opts.includeAddSlot) unfinished.push({ id: ADD_SLOT_ID, r: ADD_SLOT_RADIUS });
  const done: Item[] = tasks
    .filter((t) => t.workStatus === "DONE")
    .sort(byPriorityThenTitle)
    .map((t) => ({ id: t.id, r: PRIORITY_RADIUS[t.priority] }));

  const bubbles: ClusterBubble[] = [];
  let ring = 0;
  let prevOuter = CENTER_RADIUS;

  for (const group of [unfinished, done]) {
    let i = 0;
    while (i < group.length) {
      const maxRemaining = Math.max(...group.slice(i).map((item) => item.r));
      const R = prevOuter + BUBBLE_GAP + maxRemaining;
      const members: Item[] = [];
      let used = 0;
      while (i < group.length) {
        const w = angularWidth(group[i].r, R);
        if (members.length > 0 && used + w > 2 * Math.PI) break;
        members.push(group[i]);
        used += w;
        i++;
      }
      const slack = (2 * Math.PI - used) / members.length;
      let cursor = -Math.PI / 2 - angularWidth(members[0].r, R) / 2;
      for (const m of members) {
        const w = angularWidth(m.r, R);
        const angle = cursor + w / 2;
        bubbles.push({ id: m.id, x: R * Math.cos(angle), y: R * Math.sin(angle), r: m.r, ring });
        cursor += w + slack;
      }
      prevOuter = R + Math.max(...members.map((m) => m.r));
      ring++;
    }
  }

  const radius = bubbles.reduce((max, b) => Math.max(max, Math.hypot(b.x, b.y) + b.r), CENTER_RADIUS);
  return { bubbles, radius };
}
