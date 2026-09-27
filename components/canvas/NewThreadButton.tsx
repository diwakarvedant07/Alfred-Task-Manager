"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

const DEFAULT_COLOR = "#38e0ff";
const PRESET_COLORS = ["#38e0ff", "#a78bfa", "#34d399", "#f59e0b", "#f472b6", "#f87171"];

export default function NewThreadButton({
  onCreate,
}: {
  onCreate: (input: { name: string; categoryColor: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [categoryColor, setCategoryColor] = useState(DEFAULT_COLOR);
  const canSubmit = name.trim() !== "";

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={15} strokeWidth={2.5} />
        New thread
      </Button>
    );
  }

  function submit() {
    if (!canSubmit) return;
    onCreate({ name, categoryColor });
    setOpen(false);
    setName("");
  }

  return (
    <Modal ariaLabel="New thread" onClose={() => setOpen(false)}>
      <h2 className="text-lg font-semibold tracking-tight">New thread</h2>
      <p className="mb-5 mt-1 text-sm text-fg/55">Threads group related tasks on your canvas.</p>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Input
          label="Thread name"
          placeholder="e.g. Product launch"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-wide text-fg/70">Color</span>
          <div className="flex items-center gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Use color ${color}`}
                aria-pressed={categoryColor === color}
                onClick={() => setCategoryColor(color)}
                className="flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-transform duration-150 hover:scale-110 aria-pressed:ring-2 aria-pressed:ring-fg/60"
                style={{ backgroundColor: color }}
              >
                {categoryColor === color && <Check size={14} className="text-black/70" strokeWidth={3} />}
              </button>
            ))}
            <label
              className="relative ml-1 flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-fg/30 text-fg/50 transition-colors hover:border-fg/60"
              title="Custom color"
              style={PRESET_COLORS.includes(categoryColor) ? undefined : { backgroundColor: categoryColor, borderStyle: "solid" }}
            >
              <Plus size={14} />
              <input
                type="color"
                aria-label="Color"
                value={categoryColor}
                onChange={(e) => setCategoryColor(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>
        </div>
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}
