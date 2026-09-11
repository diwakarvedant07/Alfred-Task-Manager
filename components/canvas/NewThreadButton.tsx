"use client";

import { useState } from "react";

const DEFAULT_COLOR = "#38e0ff";

export default function NewThreadButton({
  onCreate,
}: {
  onCreate: (input: { name: string; categoryColor: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [categoryColor, setCategoryColor] = useState(DEFAULT_COLOR);

  if (!open) {
    return <button onClick={() => setOpen(true)}>New thread</button>;
  }

  return (
    <div role="dialog" aria-label="New thread">
      <label>
        Thread name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Color
        <input type="color" value={categoryColor} onChange={(e) => setCategoryColor(e.target.value)} />
      </label>
      <button
        onClick={() => {
          onCreate({ name, categoryColor });
          setOpen(false);
          setName("");
        }}
      >
        Create
      </button>
    </div>
  );
}
