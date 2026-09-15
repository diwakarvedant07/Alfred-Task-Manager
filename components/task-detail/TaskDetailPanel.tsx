"use client";

import { useState } from "react";
import { X } from "lucide-react";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";

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

  return (
    <div
      role="dialog"
      aria-label="Task detail"
      className="flex h-full flex-col gap-4 overflow-y-auto border-l border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] p-5 text-[var(--text,#eafcff)]"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Task detail</h2>
        <button
          aria-label="Close"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text,#eafcff)]/70 hover:bg-[var(--text,#eafcff)]/10 hover:text-[var(--text,#eafcff)]"
        >
          <X size={18} />
        </button>
      </div>

      {!canEdit && (
        <p className="rounded-lg border border-[var(--accent,#38e0ff)]/30 bg-[var(--accent,#38e0ff)]/10 px-3 py-2 text-sm">
          You have view-only access to this thread.
        </p>
      )}

      <Input
        label="Title"
        value={task.title}
        disabled={!canEdit}
        onChange={(e) => onUpdateTask({ title: e.target.value })}
      />
      <Textarea
        label="Description"
        value={task.description}
        disabled={!canEdit}
        onChange={(e) => onUpdateTask({ description: e.target.value })}
      />

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
        {task.priorityIsAiSuggested && (
          <span
            aria-label="AI suggested"
            className="self-start rounded-full bg-[var(--accent,#38e0ff)]/15 px-2 py-0.5 text-xs text-[var(--accent,#38e0ff)]"
          >
            🤖 AI
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-[var(--text,#eafcff)]/10 pt-4">
        {updates.map((u) => (
          <p key={u.id} className="text-sm text-[var(--text,#eafcff)]/80">
            {u.body}
          </p>
        ))}
      </div>

      <Textarea label="Add an update" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <Button
        onClick={() => {
          onAddComment(draft);
          setDraft("");
        }}
      >
        Post update
      </Button>
    </div>
  );
}
