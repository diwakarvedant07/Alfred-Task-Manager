"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";

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
    return <Button onClick={() => setOpen(true)}>New task</Button>;
  }

  return (
    <Modal ariaLabel={`New task in ${threadId}`} onClose={() => setOpen(false)}>
      <h2 className="mb-4 text-lg font-semibold text-[var(--text,#eafcff)]">New task</h2>
      <div className="flex flex-col gap-4">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Input
          label="Due date"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button
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
        </Button>
      </div>
    </Modal>
  );
}
