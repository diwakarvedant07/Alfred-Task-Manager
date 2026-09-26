import { Handle, Position } from "@xyflow/react";
import { Circle, CircleDashed, CircleCheck, MessageSquare } from "lucide-react";
import CardMenu from "./CardMenu";
import Orb from "@/components/ui/Orb";

const WORK_STATUS: Record<string, { label: string; icon: typeof Circle; className: string }> = {
  TODO: { label: "To Do", icon: Circle, className: "bg-fg/[0.07] text-fg/70" },
  IN_PROGRESS: { label: "In Progress", icon: CircleDashed, className: "bg-accent/15 text-accent" },
  DONE: { label: "Done", icon: CircleCheck, className: "bg-emerald-500/15 text-emerald-500" },
};

const PRIORITY: Record<string, { label: string; dot: string }> = {
  LOW: { label: "Low", dot: "bg-sky-400" },
  MEDIUM: { label: "Medium", dot: "bg-amber-400" },
  HIGH: { label: "High", dot: "bg-rose-500" },
};

const NOOP = () => {};

export default function TaskNode({
  data,
}: {
  id: string;
  data: {
    title: string;
    workStatus: string;
    priority: string;
    priorityIsAiSuggested: boolean;
    updateCount: number;
    // The task's primary thread's category color, used for the card's
    // left stripe so cards visibly group by thread (the threads panel on
    // the canvas acts as the legend).
    threadColor?: string;
    onRename?: () => void;
    onMoveToThread?: () => void;
    onLinkSecondaryThread?: () => void;
    onDelete?: () => void;
  };
}) {
  const status = WORK_STATUS[data.workStatus] ?? WORK_STATUS.TODO;
  const priority = PRIORITY[data.priority] ?? PRIORITY.MEDIUM;
  const StatusIcon = status.icon;
  const done = data.workStatus === "DONE";

  return (
    // .task-card (app/globals.css) owns the shadow, the hover lift and the
    // accent glow that consumes lib/theme.ts's --glow-opacity.
    <div className="task-card group/card relative w-[200px] cursor-pointer overflow-hidden rounded-2xl border border-fg/10 bg-surface text-fg">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: data.threadColor ?? "var(--accent)" }}
      />
      <Handle type="target" position={Position.Top} />
      <div className="flex flex-col gap-3 py-3 pl-4 pr-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 pt-0.5">
            <div
              className={`text-[13px] font-semibold leading-snug ${done ? "text-fg/50 line-through decoration-fg/30" : ""}`}
            >
              {data.title}
            </div>
          </div>
          <div className="opacity-60 transition-opacity group-hover/card:opacity-100">
            <CardMenu
              variant="task"
              onRename={data.onRename ?? NOOP}
              onMoveToThread={data.onMoveToThread ?? NOOP}
              onLinkSecondaryThread={data.onLinkSecondaryThread ?? NOOP}
              onDelete={data.onDelete ?? NOOP}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 whitespace-nowrap pr-2 text-[11px] font-medium">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${status.className}`}>
            <StatusIcon size={12} strokeWidth={2.4} />
            <span>{status.label}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-fg/[0.06] px-2 py-0.5 text-fg/70">
            <span className={`h-1.5 w-1.5 rounded-full ${priority.dot}`} />
            <span>{priority.label}</span>
            {data.priorityIsAiSuggested && <Orb state="working" size={14} halo={false} label="AI suggested" />}
          </span>
          <span
            className="ml-auto inline-flex items-center gap-1 text-fg/45"
            aria-label={`${data.updateCount} ${data.updateCount === 1 ? "update" : "updates"}`}
          >
            <MessageSquare size={12} />
            {data.updateCount}
          </span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
