"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { THEMED_SCROLLBAR } from "@/components/ui/scrollbar";

export type JarvisSessionSummary = { id: string; title: string | null; updatedAt: Date };

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

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
    <div className="flex h-full w-64 shrink-0 flex-col gap-2 border-r border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] p-3">
      <Button onClick={onNewChat} className="w-full justify-start gap-2">
        <Plus size={16} />
        New chat
      </Button>
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
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(s.id)}
                onKeyDown={(e) => e.key === "Enter" && onSelect(s.id)}
                className={`group flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${
                  s.id === activeSessionId
                    ? "bg-[var(--accent,#38e0ff)]/10 text-[var(--text,#eafcff)]"
                    : "text-[var(--text,#eafcff)]/80 hover:bg-[var(--text,#eafcff)]/5"
                }`}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{s.title ?? "New chat"}</span>
                  <span className="text-xs text-[var(--text,#eafcff)]/50">{formatRelativeTime(s.updatedAt)}</span>
                </div>
                <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
                  <button
                    aria-label="Rename session"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDraftTitle(s.title ?? "");
                      setEditingId(s.id);
                    }}
                    className="rounded p-1 hover:bg-[var(--text,#eafcff)]/10"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    aria-label="Delete session"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(s.id);
                    }}
                    className="rounded p-1 hover:bg-[var(--text,#eafcff)]/10"
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
