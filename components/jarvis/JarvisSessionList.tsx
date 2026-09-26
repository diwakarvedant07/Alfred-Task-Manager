"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { THEMED_SCROLLBAR } from "@/components/ui/scrollbar";
import { formatRelativeTime } from "@/lib/relativeTime";

export type JarvisSessionSummary = { id: string; title: string | null; updatedAt: Date };

export default function JarvisSessionList({
  sessions,
  activeSessionId,
  onNewChat,
  onSelect,
  onRename,
  onDelete,
}: {
  sessions: JarvisSessionSummary[];
  activeSessionId: string | null;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  function commitRename(id: string) {
    onRename(id, draftTitle);
    setEditingId(null);
  }

  return (
    <div className="glass hidden h-full w-64 shrink-0 animate-slide-up flex-col gap-3 border-y-0 border-l-0 p-3 md:flex">
      <Button onClick={onNewChat} className="w-full justify-start gap-2">
        <Plus size={16} />
        New chat
      </Button>
      <p className="px-2 pt-1 text-[11px] font-medium uppercase tracking-wider text-fg/40">Recent</p>
      <ul aria-label="Chat sessions" className={`flex flex-1 flex-col gap-1 overflow-y-auto ${THEMED_SCROLLBAR}`}>
        {sessions.map((s) => (
          <li key={s.id}>
            {editingId === s.id ? (
              <div className="p-1">
                <Input
                  label="Session title"
                  hideLabel
                  autoFocus
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onBlur={() => commitRename(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(s.id);
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setEditingId(null);
                    }
                  }}
                />
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(s.id)}
                onKeyDown={(e) => e.key === "Enter" && onSelect(s.id)}
                className={`group relative flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 ${
                  s.id === activeSessionId
                    ? "bg-accent/10 text-fg"
                    : "text-fg/75 hover:bg-fg/[0.05] hover:text-fg"
                }`}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{s.title ?? "New chat"}</span>
                  <span className="text-xs text-fg/45">{formatRelativeTime(s.updatedAt)}</span>
                </div>
                <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    aria-label="Rename session"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDraftTitle(s.title ?? "");
                      setEditingId(s.id);
                    }}
                    className="rounded-md p-1 text-fg/60 transition-colors hover:bg-fg/10 hover:text-fg"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    aria-label="Delete session"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(s.id);
                    }}
                    className="rounded-md p-1 text-fg/60 transition-colors hover:bg-fg/10 hover:text-fg"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
