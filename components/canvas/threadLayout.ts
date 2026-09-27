// Diameter of a collapsed thread bubble, in canvas units.
export const COLLAPSED_DIAMETER = 150;

// Default grid for threads the user has never dragged. Wide enough that a
// typical open cluster (~10 tasks, radius ~150) doesn't reach its neighbour.
const THREAD_GRID_SPACING = 520;
const THREAD_GRID_COLUMNS = 3;

export function defaultThreadPosition(index: number): { x: number; y: number } {
  return {
    x: (index % THREAD_GRID_COLUMNS) * THREAD_GRID_SPACING,
    y: Math.floor(index / THREAD_GRID_COLUMNS) * THREAD_GRID_SPACING,
  };
}

type Circle = { x: number; y: number; r: number };

export function clustersOverlap(a: Circle, b: Circle): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r;
}

const MAX_FOCUS_ZOOM = 1.2;
const MIN_READABLE_ZOOM = 0.8;

/**
 * Zoom to use when gliding the camera to a just-opened cluster: keep the
 * current zoom (pan only) if the cluster already fits and is readable,
 * otherwise the zoom that fits it, capped at MAX_FOCUS_ZOOM.
 */
export function cameraZoomForCluster(
  currentZoom: number,
  viewport: { width: number; height: number },
  clusterRadius: number,
  padding: number
): number {
  const fit = Math.min(viewport.width, viewport.height) / (2 * (clusterRadius + padding));
  const target = Math.min(fit, MAX_FOCUS_ZOOM);
  if (currentZoom <= fit && currentZoom >= Math.min(target, MIN_READABLE_ZOOM)) return currentZoom;
  return target;
}
