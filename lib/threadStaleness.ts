export const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export function isThreadStale(lastViewedAt: Date | null, now: Date): boolean {
  if (lastViewedAt === null) return false;
  return now.getTime() - lastViewedAt.getTime() > STALE_THRESHOLD_MS;
}
