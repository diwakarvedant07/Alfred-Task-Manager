"use client";

import { useState } from "react";
import { ChevronDown, Layers } from "lucide-react";
import NewThreadButton from "./NewThreadButton";
import NewTaskButton from "./NewTaskButton";
import ShareThreadDialog from "./ShareThreadDialog";

type ThreadSummary = { id: string; name: string; categoryColor: string; role: "OWNER" | "EDITOR" | "VIEWER" };
type ThreadShareItem = {
  id: string;
  permission: "VIEWER" | "EDITOR";
  sharedWithUser: { name: string; email: string };
};

// The canvas's floating control surface: "New thread", then one compact
// row per thread (color legend, task count, add-task and share actions).
// Replaces the old stack of full-size buttons, which grew a new row of
// buttons per thread down the canvas and rendered each thread name as
// unstyled (and in dark mode, invisible) text.
export default function ThreadsPanel({
  threads,
  taskCounts,
  threadShares,
  onCreateThread,
  onCreateTask,
  onShareThread,
  onLoadThreadShares,
  onRevokeThreadShare,
  onFocusThread,
}: {
  threads: ThreadSummary[];
  taskCounts: Record<string, number>;
  threadShares: Record<string, ThreadShareItem[]>;
  onCreateThread: (input: { name: string; categoryColor: string }) => void;
  onCreateTask: (threadId: string, input: { title: string; description?: string; dueDate?: Date }) => void;
  onShareThread: (threadId: string, email: string, permission: "VIEWER" | "EDITOR") => void | Promise<void>;
  onLoadThreadShares: (threadId: string) => void;
  onRevokeThreadShare: (threadId: string, shareId: string) => void | Promise<void>;
  onFocusThread: (threadId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="glass elevated flex w-[288px] max-w-[calc(100vw-24px)] animate-slide-up flex-col overflow-hidden rounded-2xl text-fg">
      <div className="flex items-center justify-between gap-2 p-2 pl-3">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-controls="canvas-thread-list"
          className="flex items-center gap-2 rounded-lg py-1 text-xs font-semibold uppercase tracking-wider text-fg/55 transition-colors hover:text-fg"
        >
          <Layers size={14} />
          Threads
          <span className="rounded-full bg-fg/10 px-1.5 py-px text-[10px] text-fg/70">{threads.length}</span>
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
          />
        </button>
        <NewThreadButton onCreate={onCreateThread} />
      </div>

      {!collapsed && (
        <ul
          id="canvas-thread-list"
          aria-label="Threads"
          className="flex max-h-[45vh] flex-col gap-0.5 overflow-y-auto border-t border-fg/[0.08] p-1.5"
        >
          {threads.length === 0 && (
            <li className="px-2 py-3 text-xs leading-relaxed text-fg/50">
              No threads yet. Create one to start adding tasks.
            </li>
          )}
          {threads.map((thread, i) => (
            <li
              key={thread.id}
              className="group flex animate-slide-up items-center gap-1 rounded-xl py-1 pl-2 pr-1 transition-colors hover:bg-fg/[0.05]"
              style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
            >
              <button
                type="button"
                onClick={() => onFocusThread(thread.id)}
                title={`Show ${thread.name} on the canvas`}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-fg/5"
                  style={{ background: thread.categoryColor }}
                />
                <span className="truncate font-medium text-fg/85 group-hover:text-fg">{thread.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-fg/40">{taskCounts[thread.id] ?? 0}</span>
                {thread.role !== "OWNER" && (
                  <span className="shrink-0 rounded-full border border-fg/15 px-1.5 text-[10px] uppercase tracking-wide text-fg/50">
                    {thread.role === "EDITOR" ? "Editor" : "Viewer"}
                  </span>
                )}
              </button>
              <div className="flex shrink-0 items-center opacity-70 transition-opacity group-hover:opacity-100">
                {thread.role !== "VIEWER" && (
                  <NewTaskButton
                    compact
                    threadId={thread.id}
                    threadName={thread.name}
                    onCreate={(input) => onCreateTask(thread.id, input)}
                  />
                )}
                {/* Sharing (invite/list/revoke) is OWNER-only server-side
                    (lib/permissions.ts canManageShares) — the whole dialog is
                    hidden for an EDITOR/VIEWER rather than shown and rejected. */}
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
