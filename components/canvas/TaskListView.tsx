"use client";

import { useState } from "react";
import { ChevronDown, Circle, CircleCheck, CircleDashed, MessageSquare } from "lucide-react";
import NewThreadButton from "./NewThreadButton";
import NewTaskButton from "./NewTaskButton";
import ShareThreadDialog from "./ShareThreadDialog";
import CardMenu from "./CardMenu";
import Orb from "@/components/ui/Orb";

type ThreadSummary = { id: string; name: string; categoryColor: string; role: "OWNER" | "EDITOR" | "VIEWER" };
type ThreadShareItem = {
  id: string;
  permission: "VIEWER" | "EDITOR";
  sharedWithUser: { name: string; email: string };
};
type TaskItem = {
  id: string;
  primaryThreadId: string;
  title: string;
  workStatus: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH";
  priorityIsAiSuggested: boolean;
  updateCount: number;
};

const WORK_STATUS = {
  TODO: { label: "To Do", icon: Circle, className: "text-fg/45" },
  IN_PROGRESS: { label: "In Progress", icon: CircleDashed, className: "text-accent" },
  DONE: { label: "Done", icon: CircleCheck, className: "text-emerald-500" },
} as const;

const PRIORITY = {
  LOW: { label: "Low", dot: "bg-sky-400" },
  MEDIUM: { label: "Medium", dot: "bg-amber-400" },
  HIGH: { label: "High", dot: "bg-rose-500" },
} as const;

// Unfinished work first, and within that the most urgent first — on a
// phone the list is the whole view, so the top rows should be what needs
// doing next.
const STATUS_ORDER = { IN_PROGRESS: 0, TODO: 1, DONE: 2 } as const;
const PRIORITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;

function sortTasks(tasks: TaskItem[]): TaskItem[] {
  return [...tasks].sort(
    (a, b) =>
      STATUS_ORDER[a.workStatus] - STATUS_ORDER[b.workStatus] ||
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      a.title.localeCompare(b.title)
  );
}

// The phone alternative to the free-form canvas: the same threads and
// tasks as a scrollable, thread-grouped list with thumb-sized rows. Every
// canvas action (new thread/task, share, card and bubble menus) is still
// reachable from here, so nothing requires switching back to the canvas.
export default function TaskListView({
  threads,
  tasks,
  threadShares,
  selectedTaskId,
  onOpenTask,
  onCreateThread,
  onCreateTask,
  onShareThread,
  onLoadThreadShares,
  onRevokeThreadShare,
  onMoveToThread,
  onLinkSecondaryThread,
  onDeleteTask,
  onRenameThread,
  onChangeThreadColor,
  onCloseThread,
  onDeleteThread,
  onViewCatchUp,
}: {
  threads: ThreadSummary[];
  tasks: TaskItem[];
  threadShares: Record<string, ThreadShareItem[]>;
  selectedTaskId: string | null;
  onOpenTask: (taskId: string) => void;
  onCreateThread: (input: { name: string; categoryColor: string }) => void;
  onCreateTask: (threadId: string, input: { title: string; description?: string; dueDate?: Date }) => void;
  onShareThread: (threadId: string, email: string, permission: "VIEWER" | "EDITOR") => void | Promise<void>;
  onLoadThreadShares: (threadId: string) => void;
  onRevokeThreadShare: (threadId: string, shareId: string) => void | Promise<void>;
  onMoveToThread: (taskId: string) => void;
  onLinkSecondaryThread: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onRenameThread: (threadId: string) => void;
  onChangeThreadColor: (threadId: string) => void;
  onCloseThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onViewCatchUp: (threadId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    // pb-28 keeps the last row clear of the floating Jarvis launcher.
    <div className="absolute inset-0 overflow-y-auto overscroll-contain px-3 pb-28 pt-16 text-fg">
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-fg/50">
          {threads.length} {threads.length === 1 ? "thread" : "threads"} · {tasks.length}{" "}
          {tasks.length === 1 ? "task" : "tasks"}
        </p>
        <NewThreadButton onCreate={onCreateThread} />
      </div>

      <div className="flex flex-col gap-3">
        {threads.map((thread, i) => {
          const threadTasks = sortTasks(tasks.filter((t) => t.primaryThreadId === thread.id));
          const isCollapsed = collapsed[thread.id] ?? false;
          const listId = `thread-list-${thread.id}`;
          return (
            <section
              key={thread.id}
              aria-label={thread.name}
              // Each .glass card is its own stacking context (backdrop-filter),
              // so an open row menu would otherwise paint under the next card.
              className="glass relative animate-slide-up rounded-2xl has-[[role=menu]]:z-10"
              style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
            >
              <div className="flex items-center gap-1 py-1.5 pl-3 pr-1.5">
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [thread.id]: !isCollapsed }))}
                  aria-expanded={!isCollapsed}
                  aria-controls={listId}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left outline-none"
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-fg/5"
                    style={{ background: thread.categoryColor }}
                  />
                  <span className="truncate text-[15px] font-semibold">{thread.name}</span>
                  <span className="shrink-0 rounded-full bg-fg/10 px-1.5 py-px text-[11px] tabular-nums text-fg/70">
                    {threadTasks.length}
                  </span>
                  {thread.role !== "OWNER" && (
                    <span className="shrink-0 rounded-full border border-fg/15 px-1.5 text-[10px] uppercase tracking-wide text-fg/50">
                      {thread.role === "EDITOR" ? "Editor" : "Viewer"}
                    </span>
                  )}
                  <ChevronDown
                    size={16}
                    className={`ml-auto shrink-0 text-fg/40 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`}
                  />
                </button>
                {thread.role !== "VIEWER" && (
                  <NewTaskButton
                    compact
                    threadId={thread.id}
                    threadName={thread.name}
                    onCreate={(input) => onCreateTask(thread.id, input)}
                  />
                )}
                {thread.role === "OWNER" && (
                  <ShareThreadDialog
                    compact
                    threadId={thread.id}
                    threadName={thread.name}
                    onShare={(email, permission) => onShareThread(thread.id, email, permission)}
                    onOpen={() => onLoadThreadShares(thread.id)}
                    shares={threadShares[thread.id] ?? []}
                    onRevoke={(shareId) => onRevokeThreadShare(thread.id, shareId)}
                  />
                )}
                <CardMenu
                  variant="thread"
                  onRename={() => onRenameThread(thread.id)}
                  onChangeColor={() => onChangeThreadColor(thread.id)}
                  onClose={() => onCloseThread(thread.id)}
                  onDelete={() => onDeleteThread(thread.id)}
                  onViewCatchUp={() => onViewCatchUp(thread.id)}
                  canEditMeta={thread.role === "OWNER" || thread.role === "EDITOR"}
                  canCloseOrDelete={thread.role === "OWNER"}
                />
              </div>

              {!isCollapsed && (
                <ul id={listId} aria-label={`${thread.name} tasks`} className="border-t border-fg/[0.08] p-1.5">
                  {threadTasks.length === 0 && (
                    <li className="px-2 py-3 text-sm text-fg/45">No tasks yet.</li>
                  )}
                  {threadTasks.map((task) => {
                    const status = WORK_STATUS[task.workStatus];
                    const priority = PRIORITY[task.priority];
                    const StatusIcon = status.icon;
                    const done = task.workStatus === "DONE";
                    return (
                      <li
                        key={task.id}
                        className={`flex items-center gap-1 rounded-xl transition-colors active:bg-fg/[0.08] ${
                          task.id === selectedTaskId ? "bg-accent/10" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onOpenTask(task.id)}
                          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pl-2 text-left outline-none"
                        >
                          <StatusIcon
                            size={20}
                            strokeWidth={2.2}
                            className={`shrink-0 ${status.className}`}
                            aria-label={status.label}
                          />
                          <span className="flex min-w-0 flex-1 flex-col gap-1">
                            <span
                              className={`truncate text-sm font-medium ${done ? "text-fg/50 line-through decoration-fg/30" : ""}`}
                            >
                              {task.title}
                            </span>
                            <span className="flex items-center gap-3 text-xs text-fg/50">
                              <span className="inline-flex items-center gap-1.5">
                                <span className={`h-1.5 w-1.5 rounded-full ${priority.dot}`} />
                                {priority.label}
                                {task.priorityIsAiSuggested && (
                                  <Orb state="working" size={14} halo={false} label="AI suggested" />
                                )}
                              </span>
                              <span
                                className="inline-flex items-center gap-1"
                                aria-label={`${task.updateCount} ${task.updateCount === 1 ? "update" : "updates"}`}
                              >
                                <MessageSquare size={12} />
                                {task.updateCount}
                              </span>
                            </span>
                          </span>
                        </button>
                        <CardMenu
                          variant="task"
                          onRename={() => onOpenTask(task.id)}
                          onMoveToThread={() => onMoveToThread(task.id)}
                          onLinkSecondaryThread={() => onLinkSecondaryThread(task.id)}
                          onDelete={() => onDeleteTask(task.id)}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
