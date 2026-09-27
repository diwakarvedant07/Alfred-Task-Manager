"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import CardMenu from "./CardMenu";
import { useLongPress } from "./useLongPress";
import { priorityMarks, taskAriaLabel } from "./threadSummary";
import type { Priority, WorkStatus } from "./clusterLayout";

export type TaskBubbleTask = { id: string; title: string; priority: Priority; workStatus: WorkStatus };

const MARK_CLASS: Record<Priority, string> = {
  HIGH: "text-red-500",
  MEDIUM: "text-amber-500",
  LOW: "text-emerald-500",
};

// One task in an open thread cluster. Filled with the thread's color so a
// task always reads as belonging to its thread; priority is the "!" marks
// (and the bubble's size, set by the caller via r). `nodrag` keeps a press
// on a task from dragging the whole thread node.
export default function TaskBubble({
  task,
  r,
  color,
  compact,
  onOpen,
  onRename,
  onMoveToThread,
  onLinkSecondaryThread,
  onDelete,
}: {
  task: TaskBubbleTask;
  r: number;
  color: string;
  // Outer rings of big clusters: one-line title.
  compact: boolean;
  onOpen: () => void;
  onRename: () => void;
  onMoveToThread: () => void;
  onLinkSecondaryThread: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const longPress = useLongPress(() => setMenuOpen(true));
  const done = task.workStatus === "DONE";

  return (
    <div className="nodrag relative" style={{ width: r * 2, height: r * 2 }}>
      {task.workStatus === "IN_PROGRESS" && (
        <span
          aria-hidden
          data-testid="in-progress-ring"
          className="pointer-events-none absolute -inset-1 animate-pulse rounded-full border-2"
          style={{ borderColor: color }}
        />
      )}
      <button
        type="button"
        aria-label={taskAriaLabel(task)}
        {...longPress.handlers}
        onClick={() => {
          if (longPress.consumeLongPress()) return;
          onOpen();
        }}
        className={`flex h-full w-full flex-col items-center justify-center rounded-full border px-1.5 text-center leading-tight text-fg outline-none transition-transform duration-200 ease-[var(--ease-out-soft)] hover:scale-105 focus-visible:ring-2 focus-visible:ring-accent/60 ${
          done ? "opacity-45" : ""
        }`}
        style={{
          background: `color-mix(in srgb, ${color} 22%, var(--surface))`,
          borderColor: `color-mix(in srgb, ${color} 60%, transparent)`,
        }}
      >
        {done ? (
          <Check aria-hidden size={12} strokeWidth={3} className="text-emerald-500" />
        ) : (
          <span aria-hidden className={`text-[11px] font-bold leading-none ${MARK_CLASS[task.priority]}`}>
            {priorityMarks(task.priority)}
          </span>
        )}
        <span
          className={`mt-0.5 w-full overflow-hidden break-words text-[10px] font-medium ${
            compact ? "line-clamp-1" : "line-clamp-2"
          } ${done ? "line-through" : ""}`}
        >
          {task.title}
        </span>
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-0">
          <CardMenu
            variant="task"
            hideTrigger
            open
            onOpenChange={setMenuOpen}
            onRename={onRename}
            onMoveToThread={onMoveToThread}
            onLinkSecondaryThread={onLinkSecondaryThread}
            onDelete={onDelete}
          />
        </div>
      )}
    </div>
  );
}
