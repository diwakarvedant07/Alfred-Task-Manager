export function computeThreadCentroid(
  positions: { positionX: number; positionY: number }[]
): { x: number; y: number } {
  if (positions.length === 0) return { x: 0, y: 0 };
  const sum = positions.reduce(
    (acc, p) => ({ x: acc.x + p.positionX, y: acc.y + p.positionY }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / positions.length, y: sum.y / positions.length };
}

// Spacing between grid cells for a thread's initial task layout, in canvas
// units. Wide enough that TaskNode cards (and, at the BUBBLE tier, the
// thread centroid they feed) don't visually overlap at default zoom.
const INITIAL_TASK_GRID_SPACING = 220;
const INITIAL_TASK_GRID_COLUMNS = 4;

/**
 * Deterministic grid offset for a newly created task's initial position,
 * based on how many (active) tasks already exist in its thread. Without
 * this, every new task defaults to {0, 0} and stacks exactly on top of any
 * other task that also has no saved position — including every other task
 * in the same thread, which also breaks the BUBBLE-tier thread centroid
 * (an average of identical points). This does not need to be collision-free
 * under concurrent creates — only to keep tasks visibly distinct on first
 * render so the "drag to cluster" interaction has something to drag apart.
 */
export function computeInitialTaskOffset(indexInThread: number): { x: number; y: number } {
  const column = indexInThread % INITIAL_TASK_GRID_COLUMNS;
  const row = Math.floor(indexInThread / INITIAL_TASK_GRID_COLUMNS);
  return { x: column * INITIAL_TASK_GRID_SPACING, y: row * INITIAL_TASK_GRID_SPACING };
}
