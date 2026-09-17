"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import FormAlert from "@/components/ui/FormAlert";
import { THEMED_SCROLLBAR } from "@/components/ui/scrollbar";

export type JarvisMessageView = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  toolCalls: { tool: string; success: boolean; summary: string }[] | null;
  totalTokens: number | null;
};

export default function JarvisChat({
  sessionTitle,
  messages,
  sending,
  error,
  onSend,
  onRenameSession,
  onClose,
}: {
  sessionTitle: string | null;
  messages: JarvisMessageView[];
  sending: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onRenameSession: (title: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(sessionTitle ?? "");
  const listEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, sending]);

  const totalTokens = messages.reduce((sum, m) => sum + (m.totalTokens ?? 0), 0);

  function commitTitle() {
    onRenameSession(titleDraft);
    setEditingTitle(false);
  }

  function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    onSend(text);
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--text,#eafcff)]/10 px-5 py-3">
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") setEditingTitle(false);
            }}
            aria-label="Session title"
            className="min-w-0 flex-1 rounded border border-[var(--accent,#38e0ff)]/40 bg-transparent px-2 py-1 text-lg font-semibold text-[var(--text,#eafcff)] outline-none"
          />
        ) : (
          <h2
            role="button"
            tabIndex={0}
            onClick={() => {
              setTitleDraft(sessionTitle ?? "");
              setEditingTitle(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setTitleDraft(sessionTitle ?? "");
                setEditingTitle(true);
              }
            }}
            className="min-w-0 flex-1 cursor-text truncate text-lg font-semibold text-[var(--text,#eafcff)]"
          >
            {sessionTitle ?? "New chat"}
          </h2>
        )}
        <div className="flex shrink-0 items-center gap-3">
          {totalTokens > 0 && (
            <span className="text-xs text-[var(--text,#eafcff)]/50">{totalTokens.toLocaleString()} tokens</span>
          )}
          <button
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text,#eafcff)]/70 hover:bg-[var(--text,#eafcff)]/10 hover:text-[var(--text,#eafcff)]"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto p-5 ${THEMED_SCROLLBAR}`}>
        <div className="flex flex-col gap-3">
          {messages.map((m) => (
            <div
              key={m.id}
              data-testid="jarvis-message"
              className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm ${
                m.role === "USER"
                  ? "self-end bg-[var(--accent,#38e0ff)]/20 text-[var(--text,#eafcff)]"
                  : "self-start bg-[var(--text,#eafcff)]/10 text-[var(--text,#eafcff)]"
              }`}
            >
              <strong>{m.role === "USER" ? "You" : "Jarvis"}:</strong> {m.content}
              {m.toolCalls?.map((c, i) => (
                <div key={i} className="mt-1 text-xs text-[var(--text,#eafcff)]/70">
                  {c.success ? "✓" : "✗"} {c.summary}
                </div>
              ))}
              {m.role === "ASSISTANT" && m.totalTokens != null && (
                <div className="mt-1 text-xs text-[var(--text,#eafcff)]/40">{m.totalTokens} tokens</div>
              )}
            </div>
          ))}
          {sending && (
            <div
              data-testid="jarvis-loading"
              className="flex w-fit items-center gap-1 self-start rounded-xl bg-[var(--text,#eafcff)]/10 px-4 py-3"
            >
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text,#eafcff)]/60 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text,#eafcff)]/60 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text,#eafcff)]/60" />
            </div>
          )}
          <div ref={listEndRef} />
        </div>
      </div>

      {error && (
        <div className="px-5 pb-2">
          <FormAlert>{error}</FormAlert>
        </div>
      )}

      <div className="flex items-end gap-2 border-t border-[var(--text,#eafcff)]/10 p-4">
        <Textarea
          label="Message Jarvis"
          hideLabel
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={sending}
          rows={1}
          className="min-h-[44px] flex-1 resize-none"
        />
        <Button onClick={handleSend} disabled={sending} className="shrink-0">
          Send
        </Button>
      </div>
    </div>
  );
}
