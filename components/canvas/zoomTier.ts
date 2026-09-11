export const ZOOM_TIER_THRESHOLD = 0.6;

export function getZoomTier(zoom: number): "BUBBLE" | "CARD" {
  return zoom >= ZOOM_TIER_THRESHOLD ? "CARD" : "BUBBLE";
}
