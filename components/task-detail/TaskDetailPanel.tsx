"use client";

import { useState } from "react";
import { X, Send, Lock } from "lucide-react";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import Orb from "@/components/ui/Orb";
import { THEMED_SCROLLBAR } from "@/components/ui/scrollbar";
import { formatRelativeTime } from "@/lib/relativeTime";

type Task = {
  id: string;
  title: string;
  description: string;
  workStatus: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH";
  priorityIsAiSuggested: boolean;
  dueDate: Date | null;
};

type TaskUpdateItem = { id: string; body: string; authorId: string; createdAt: Date };

const STATUS_BADGE: Record<Task["workStatus"], { label: string; className: string }> = {
  TODO: { label: "To Do", className: "bg-fg/[0.08] text-fg/70" },
  IN_PROGRESS: { label: "In Progress", className: "bg-accent/15 text-accent" },
  DONE: { label: "Done", className: "bg-emerald-500/15 text-emerald-500" },
};

// <input type="date"> wants yyyy-mm-dd; due dates are stored as UTC
// midnight (new Date("yyyy-mm-dd")), so read them back in UTC too.
function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export default function TaskDetailPanel({
  task,
  updates,
  onUpdateTask,
  onAddComment,
  onClose,
  canEdit = true,
}: {
  task: Task;
  updates: TaskUpdateItem[];
  onUpdateTask: (patch: Partial<Pick<Task, "title" | "description" | "workStatus" | "priority" | "dueDate">>) => void;
  onAddComment: (body: string) => void;
  onClose: () => void;
  // Viewers can read and comment on a shared thread's tasks but not edit
  // them (enforced server-side too) — defaults to true so callers that
  // don't track roles (and existing tests) keep every field editable.
  canEdit?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const status = STATUS_BADGE[task.workStatus];

  function postUpdate() {
    if (draft.trim() === "") return;
    onAddComment(draft);
    setDraft("");
  }

  return (
    <div
      role="dialog"
      aria-label="Task detail"
      className="glass elevated flex h-full flex-col overflow-hidden rounded-2xl text-fg"
    >
      <div className="flex items-center justify-between gap-3 border-b border-fg/[0.08] px-5 py-3.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Task detail</h2>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${status.className}`}>{status.label}</span>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose} className="h-9 w-9 rounded-full sm:h-8 sm:w-8">
          <X size={17} />
        </Button>
      </div>

      <div className={`flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5 ${THEMED_SCROLLBAR}`}>
        {!canEdit && (
          <p className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
            <Lock size={14} className="shrink-0 text-accent" />
            You have view-only access to this thread.
          </p>
        )}

        <Input
          label="Title"
          value={task.title}
          disabled={!canEdit}
          onChange={(e) => onUpdateTask({ title: e.target.value })}
          className="text-base font-semibold"
        />
        <Textarea
          label="Description"
          placeholder="Add more detail…"
          rows={3}
          value={task.description}
          disabled={!canEdit}
          onChange={(e) => onUpdateTask({ description: e.target.value })}
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Work status"
            value={task.workStatus}
            disabled={!canEdit}
            onChange={(e) => onUpdateTask({ workStatus: e.target.value as Task["workStatus"] })}
          >
            <option value="TODO">To Do</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="DONE">Done</option>
          </Select>

          <div className="flex flex-col gap-1.5">
            <Select
              label="Priority"
              value={task.priority}
              disabled={!canEdit}
              onChange={(e) => onUpdateTask({ priority: e.target.value as Task["priority"] })}
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </Select>
          </div>
        </div>
        {task.priorityIsAiSuggested && (
          <span
            aria-label="AI suggested"
            className="-mt-2 inline-flex items-center gap-1.5 self-start rounded-full bg-accent/10 py-0.5 pl-1 pr-2.5 text-xs text-accent"
          >
            <Orb state="working" size={16} halo={false} />
            Priority suggested by Jarvis
          </span>
        )}

        <Input
          label="Due date"
          type="date"
          value={toDateInputValue(task.dueDate)}
          disabled={!canEdit}
          onChange={(e) => onUpdateTask({ dueDate: e.target.value ? new Date(e.target.value) : null })}
        />

        <section aria-label="Updates" className="flex flex-col gap-3 border-t border-fg/[0.08] pt-5">
          <h3 className="text-xs font-medium uppercase tracking-wider text-fg/45">
            Updates {updates.length > 0 && <span className="text-fg/35">· {updates.length}</span>}
          </h3>
          {updates.length === 0 ? (
            <p className="text-sm text-fg/45">No updates yet. Post the first one below.</p>
          ) : (
            <ol className="relative flex flex-col gap-3 border-l border-fg/10 pl-4">
              {updates.map((u) => (
                <li key={u.id} className="relative animate-slide-up">
                  <span aria-hidden className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-accent ring-4 ring-[var(--surface)]" />
                  <p className="text-sm leading-relaxed text-fg/85">{u.body}</p>
                  <time dateTime={new Date(u.createdAt).toISOString()} className="text-xs text-fg/40">
                    {formatRelativeTime(u.createdAt)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <div className="flex flex-col gap-2 border-t border-fg/[0.08] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Textarea
          label="Add an update"
          hideLabel
          placeholder="Add an update…  (⌘/Ctrl + Enter to post)"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              postUpdate();
            }
          }}
          className="resize-none"
        />
        <Button onClick={postUpdate} disabled={draft.trim() === ""} className="self-end" size="sm">
          <Send size={14} />
          Post update
        </Button>
      </div>
    </div>
  );
}
