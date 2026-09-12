"use client";

import { useState } from "react";

export default function NewTaskButton({
  threadId,
  onCreate,
}: {
  threadId: string;
  onCreate: (input: { title: string; description?: string; dueDate?: Date }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");

  if (!open) {
    return <button onClick={() => setOpen(true)}>New task</button>;
  }

  return (
    <div role="dialog" aria-label={`New task in ${threadId}`}>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label>
        Due date
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </label>
      <button
        onClick={() => {
          onCreate({
            title,
            description: description || undefined,
            dueDate: dueDate ? new Date(dueDate) : undefined,
          });
          setOpen(false);
          setTitle("");
          setDescription("");
          setDueDate("");
        }}
      >
        Create task
      </button>
    </div>
  );
}
