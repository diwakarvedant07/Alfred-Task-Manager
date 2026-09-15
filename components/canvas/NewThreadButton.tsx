"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

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
    return <Button onClick={() => setOpen(true)}>New thread</Button>;
  }

  return (
    <Modal ariaLabel="New thread" onClose={() => setOpen(false)}>
      <h2 className="mb-4 text-lg font-semibold text-[var(--text,#eafcff)]">New thread</h2>
      <div className="flex flex-col gap-4">
        <Input label="Thread name" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="flex items-center gap-3 text-sm text-[var(--text,#eafcff)]">
          <span
            className="h-6 w-6 rounded-md border border-[var(--text,#eafcff)]/20"
            style={{ backgroundColor: categoryColor }}
          />
          Color
          <input
            type="color"
            aria-label="Color"
            value={categoryColor}
            onChange={(e) => setCategoryColor(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded border border-[var(--text,#eafcff)]/15 bg-transparent p-0.5"
          />
        </label>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            onCreate({ name, categoryColor });
            setOpen(false);
            setName("");
          }}
        >
          Create
        </Button>
      </div>
    </Modal>
  );
}
