"use client";

import { useState } from "react";

export default function NewTaskButton({
  threadId,
  onCreate,
}: {
  threadId: string;
  onCreate: (input: { title: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  if (!open) {
    return <button onClick={() => setOpen(true)}>New task</button>;
  }

  return (
    <div role="dialog" aria-label={`New task in ${threadId}`}>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <button
        onClick={() => {
          onCreate({ title });
          setOpen(false);
          setTitle("");
        }}
      >
        Create task
      </button>
    </div>
  );
}
