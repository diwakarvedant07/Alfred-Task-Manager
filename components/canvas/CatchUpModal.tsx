"use client";

import { X } from "lucide-react";
import Button from "@/components/ui/Button";
import Orb from "@/components/ui/Orb";

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
      className="fixed inset-0 z-[100] flex animate-fade-in flex-col items-center justify-center gap-6 bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-6 text-fg backdrop-blur-xl"
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full"
      >
        <X size={18} />
      </Button>
      <Orb state={loading ? "weaving" : "breathing"} size={96} />
      {loading ? (
        <p className="animate-pulse text-sm text-fg/60">Catching you up…</p>
      ) : (
        <div key="summary" className="flex max-w-xl animate-rise flex-col items-center gap-6 text-center">
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-accent">While you were away</span>
          <p className="text-xl leading-relaxed text-fg/90">{summary}</p>
          <Button onClick={onClose}>Got it</Button>
        </div>
      )}
    </div>
  );
}
