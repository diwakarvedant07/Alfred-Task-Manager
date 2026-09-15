"use client";

import { X } from "lucide-react";
import Button from "@/components/ui/Button";

export default function CatchUpModal({
  summary,
  loading,
  onClose,
}: {
  summary: string | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Catch-up"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-[var(--bg,#0a0e14)] text-[var(--text,#eafcff)]"
    >
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-[var(--text,#eafcff)]/70 hover:bg-[var(--text,#eafcff)]/10 hover:text-[var(--text,#eafcff)]"
      >
        <X size={18} />
      </button>
      {loading ? (
        <p className="text-sm text-[var(--text,#eafcff)]/70">Catching you up…</p>
      ) : (
        <p className="max-w-lg text-center text-lg">{summary}</p>
      )}
      {!loading && <Button onClick={onClose}>Got it</Button>}
    </div>
  );
}
