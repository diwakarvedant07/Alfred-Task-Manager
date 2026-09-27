import { COLLAPSED_DIAMETER } from "./threadLayout";
import type { ThreadTaskSummary } from "./threadSummary";

const RING_RADIUS = COLLAPSED_DIAMETER / 2 - 5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const C = COLLAPSED_DIAMETER / 2;

// Contents of a collapsed thread bubble: name, "!" rows counting open
// tasks by priority, and a done/total progress arc around the edge. The
// caller supplies the button (and its aria-label); this is visual only.
export default function ThreadDashboard({
  name,
  color,
  summary,
}: {
  name: string;
  color: string;
  summary: ThreadTaskSummary;
}) {
  const progress = summary.total ? summary.done / summary.total : 0;
  return (
    <>
      <svg
        aria-hidden
        viewBox={`0 0 ${COLLAPSED_DIAMETER} ${COLLAPSED_DIAMETER}`}
        className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
      >
        <circle cx={C} cy={C} r={RING_RADIUS} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={3} />
        {summary.done > 0 && (
          <circle
            data-testid="progress-arc"
            cx={C}
            cy={C}
            r={RING_RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
            className="transition-[stroke-dashoffset] duration-500 ease-[var(--ease-out-soft)]"
          />
        )}
      </svg>
      <span aria-hidden className="relative max-w-[110px] truncate text-sm font-semibold tracking-tight">
        {name}
      </span>
      {summary.total === 0 ? (
        <span aria-hidden className="relative mt-1 text-xs text-fg/50">
          No tasks
        </span>
      ) : (
        <span
          aria-hidden
          data-testid="priority-counts"
          className="relative mt-1.5 grid grid-cols-[auto_auto] items-baseline gap-x-2 text-xs tabular-nums text-fg/80"
        >
          <span className="text-right font-bold text-red-500">!!!</span>
          <span>{summary.high}</span>
          <span className="text-right font-bold text-amber-500">!!</span>
          <span>{summary.medium}</span>
          <span className="text-right font-bold text-emerald-500">!</span>
          <span>{summary.low}</span>
        </span>
      )}
    </>
  );
}
