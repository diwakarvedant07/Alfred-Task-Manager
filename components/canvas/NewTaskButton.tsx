"use client";

import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";

export default function NewTaskButton({
  threadId,
  threadName,
  compact = false,
  onCreate,
  renderTrigger,
}: {
  threadId: string;
  // Shown in the dialog heading ("New task in Product launch").
  threadName?: string;
  // Icon-only trigger for dense lists (the canvas threads panel); the
  // accessible name stays "New task" either way.
  compact?: boolean;
  onCreate: (input: { title: string; description?: string; dueDate?: Date }) => void;
  // Custom trigger (e.g. the "+" bubble in an open thread cluster). Gets a
  // function that opens the dialog.
  renderTrigger?: (openDialog: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const canSubmit = title.trim() !== "";

  if (!open) {
    if (renderTrigger) return <>{renderTrigger(() => setOpen(true))}</>;
    return compact ? (
      <Button
        variant="ghost"
        size="icon"
        aria-label="New task"
        title={threadName ? `Add a task to ${threadName}` : "New task"}
        onClick={() => setOpen(true)}
        className="h-7 w-7 rounded-lg"
      >
        <Plus size={15} />
      </Button>
    ) : (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={15} strokeWidth={2.5} />
        New task
      </Button>
    );
  }

  function submit() {
    if (!canSubmit) return;
    onCreate({
      title,
      description: description || undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });
    setOpen(false);
    setTitle("");
    setDescription("");
    setDueDate("");
  }

  return (
    <Modal ariaLabel={`New task in ${threadId}`} onClose={() => setOpen(false)}>
      <h2 className="text-lg font-semibold tracking-tight">New task</h2>
      <p className="mb-5 mt-1 text-sm text-fg/55">
        {threadName ? (
          <>
            Adding to <span className="font-medium text-fg/80">{threadName}</span>. Jarvis will suggest a priority.
          </>
        ) : (
          "Jarvis will suggest a priority once it's created."
        )}
      </p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Input
          label="Title"
          placeholder="What needs doing?"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          label="Description"
          placeholder="Optional details"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Input label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            Create task
          </Button>
        </div>
      </form>
    </Modal>
  );
}
