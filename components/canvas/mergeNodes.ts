import type { Node } from "@xyflow/react";

/**
 * Folds freshly derived nodes into React Flow's current ones. React Flow
 * treats a node object it hasn't seen before as brand new: unless it
 * carries `measured`, the node is hidden (visibility: hidden) until it's
 * re-measured a frame later. Re-deriving nodes on every open/close/hover
 * without carrying `measured` over made every bubble blink — and the blink
 * fired pointerleave, which re-derived again. So keep React Flow's own
 * per-node state (size, selection, and the live position mid-drag).
 */
export function mergeNodes(current: Node[], next: Node[]): Node[] {
  const byId = new Map(current.map((n) => [n.id, n]));
  return next.map((n) => {
    const existing = byId.get(n.id);
    if (!existing) return n;
    return {
      ...n,
      measured: existing.measured,
      selected: existing.selected,
      ...(existing.dragging ? { position: existing.position, dragging: true } : {}),
    };
  });
}
