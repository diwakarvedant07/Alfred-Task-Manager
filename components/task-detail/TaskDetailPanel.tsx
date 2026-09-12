"use client";

import { useState } from "react";

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
    <div role="dialog" aria-label="Task detail" style={{ background: "var(--panel-bg)", color: "var(--text)" }}>
      <button aria-label="Close" onClick={onClose}>×</button>

      {!canEdit && <p>You have view-only access to this thread.</p>}

      <input
        aria-label="Title"
        value={task.title}
        disabled={!canEdit}
        onChange={(e) => onUpdateTask({ title: e.target.value })}
      />
      <textarea
        aria-label="Description"
        value={task.description}
        disabled={!canEdit}
        onChange={(e) => onUpdateTask({ description: e.target.value })}
      />

      <label>
        Work status
        <select
          aria-label="Work status"
          value={task.workStatus}
          disabled={!canEdit}
          onChange={(e) => onUpdateTask({ workStatus: e.target.value as Task["workStatus"] })}
        >
          <option value="TODO">To Do</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="DONE">Done</option>
        </select>
      </label>

      <label>
        Priority
        <select
          aria-label="Priority"
          value={task.priority}
          disabled={!canEdit}
          onChange={(e) => onUpdateTask({ priority: e.target.value as Task["priority"] })}
        >
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
        {task.priorityIsAiSuggested && (
          <span aria-label="AI suggested" style={{ fontSize: 8, opacity: 0.7 }}>
            🤖 AI
          </span>
        )}
      </label>

      <div>
        {updates.map((u) => (
          <p key={u.id}>{u.body}</p>
        ))}
      </div>

      <textarea aria-label="Add an update" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button
        onClick={() => {
          onAddComment(draft);
          setDraft("");
        }}
      >
        Post update
      </button>
    </div>
  );
}
