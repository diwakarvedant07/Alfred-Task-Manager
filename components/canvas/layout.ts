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
