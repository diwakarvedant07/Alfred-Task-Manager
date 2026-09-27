"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, History, SquarePen, X } from "lucide-react";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import FormAlert from "@/components/ui/FormAlert";
import { motion } from "framer-motion";
import Orb from "@/components/ui/Orb";
import { THEMED_SCROLLBAR } from "@/components/ui/scrollbar";

export type JarvisMessageView = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  toolCalls: { tool: string; success: boolean; summary: string }[] | null;
  totalTokens: number | null;
};

// Starter prompts for an empty chat — each maps to something Jarvis's
// tools can actually do (create/update threads and tasks, summarize).
const SUGGESTIONS = [
  "Plan my week from my open tasks",
  "Create a thread for a product launch with 5 starter tasks",
  "What's overdue or high priority right now?",
];

const MAX_INPUT_HEIGHT = 200;

export default function JarvisChat({
  sessionTitle,
  messages,
  sending,
  error,
  onSend,
  onRenameSession,
  onClose,
  onNewChat,
  onShowHistory,
}: {
  sessionTitle: string | null;
  messages: JarvisMessageView[];
  sending: boolean;
  error: string | null;
  onSend: (text: string) => Promise<boolean>;
  onRenameSession: (title: string) => void;
  onClose: () => void;
  // Shown only below `md`, where JarvisSessionList (and its New chat
  // button) is hidden to leave room for the conversation.
  onNewChat?: () => void;
  // Also below `md` only: opens JarvisSessionList as a drawer.
  onShowHistory?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(sessionTitle ?? "");
  const listEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, sending]);

  // Auto-grow the composer with its content, up to a cap.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [draft]);

  const totalTokens = messages.reduce((sum, m) => sum + (m.totalTokens ?? 0), 0);

  function commitTitle() {
    onRenameSession(titleDraft);
    setEditingTitle(false);
  }

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || sending) return;
    setDraft("");
    const succeeded = await onSend(text);
    if (!succeeded) setDraft(text);
    inputRef.current?.focus();
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col text-fg">
      <div className="flex items-center justify-between gap-2 border-b border-fg/[0.08] px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:gap-3 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          {onShowHistory && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Chat history"
              title="Chat history"
              onClick={onShowHistory}
              className="h-9 w-9 shrink-0 rounded-full md:hidden"
            >
              <History size={17} />
            </Button>
          )}
          <motion.span layoutId="jarvis-orb" className="inline-flex">
            <Orb state={sending ? "working" : "breathing"} size={24} halo={false} />
          </motion.span>
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitle();
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setEditingTitle(false);
                }
              }}
              aria-label="Session title"
              className="min-w-0 flex-1 rounded-lg border border-accent/40 bg-transparent px-2 py-1 text-base font-semibold text-fg outline-none focus:ring-4 focus:ring-accent/15"
            />
          ) : (
            <h2
              role="button"
              tabIndex={0}
              title="Rename chat"
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
              className="min-w-0 flex-1 cursor-text truncate rounded-lg px-2 py-1 text-base font-semibold transition-colors hover:bg-fg/[0.05]"
            >
              {sessionTitle ?? "New chat"}
            </h2>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {totalTokens > 0 && (
            <span className="hidden rounded-full bg-fg/[0.06] px-2 py-0.5 text-xs tabular-nums text-fg/50 sm:inline">
              {totalTokens.toLocaleString()} tokens
            </span>
          )}
          {onNewChat && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Start a fresh conversation"
              title="New chat"
              onClick={onNewChat}
              className="h-9 w-9 rounded-full md:hidden"
            >
              <SquarePen size={16} />
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose} className="h-9 w-9 rounded-full md:h-8 md:w-8">
            <X size={18} />
          </Button>
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto ${THEMED_SCROLLBAR}`}>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-5">
          {messages.length === 0 && !sending && (
            <div className="flex animate-rise flex-col items-center gap-5 py-10 text-center">
              <Orb state="breathing" size={96} />
              <div>
                <p className="text-xl font-semibold tracking-tight">How can I help?</p>
                <p className="mt-1 text-sm text-fg/55">
                  Jarvis can create threads and tasks, update them, and summarize what&apos;s going on.
                </p>
              </div>
              <div className="flex w-full max-w-md flex-col gap-2">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="animate-slide-up rounded-xl border border-fg/10 bg-fg/[0.03] px-4 py-2.5 text-left text-sm text-fg/80 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-accent/[0.06] hover:text-fg"
                    style={{ animationDelay: `${120 + i * 60}ms` }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.role === "USER" ? (
              <div
                key={m.id}
                data-testid="jarvis-message"
                className="max-w-[80%] animate-slide-up self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm leading-relaxed text-on-accent shadow-[0_8px_24px_-12px_var(--accent)]"
              >
                <span className="sr-only">You: </span>
                {m.content}
              </div>
            ) : (
              <div key={m.id} className="flex max-w-[88%] animate-slide-up gap-3 self-start">
                <Orb state="breathing" size={24} halo={false} paused className="mt-1" />
                <div data-testid="jarvis-message" className="min-w-0 text-sm leading-relaxed">
                  <span className="sr-only">Jarvis: </span>
                  <div className="whitespace-pre-wrap text-fg/90">{m.content}</div>
                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {m.toolCalls.map((c, i) => (
                        <li
                          key={i}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                            c.success
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                              : "border-red-500/30 bg-red-500/10 text-red-500"
                          }`}
                        >
                          {c.success ? <Check size={12} /> : <X size={12} />}
                          <span className="text-fg/80">{c.summary}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )
          )}
          {sending && (
            <div
              data-testid="jarvis-loading"
              role="status"
              className="flex animate-fade-in items-center gap-3 self-start text-sm text-fg/55"
            >
              <Orb state="working" size={24} />
              <span className="animate-pulse">Jarvis is thinking…</span>
            </div>
          )}
          <div ref={listEndRef} />
        </div>
      </div>

      {error && (
        <div className="mx-auto w-full max-w-3xl px-5 pb-2">
          <FormAlert>{error}</FormAlert>
        </div>
      )}

      <div className="mx-auto w-full max-w-3xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-5">
        <div className="flex items-end gap-2 rounded-2xl border border-fg/12 bg-surface p-2 transition-[border-color,box-shadow] focus-within:border-accent/60 focus-within:ring-4 focus-within:ring-accent/10">
          {/* Textarea renders its own label+field wrapper; this is what
              lets the field take the row's remaining width. */}
          <div className="min-w-0 flex-1">
            <Textarea
              ref={inputRef}
              label="Message Jarvis"
              hideLabel
              placeholder="Ask Jarvis anything…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter inserts a newline. Skip while an
                // IME composition is active so confirming a candidate
                // doesn't send.
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              disabled={sending}
              rows={1}
              className="max-h-[200px] min-h-[40px] resize-none border-0! bg-transparent! px-2 py-2 focus:ring-0!"
            />
          </div>
          <Button
            aria-label="Send"
            size="icon"
            onClick={() => void send(draft)}
            disabled={sending}
            className="shrink-0 rounded-xl"
          >
            <ArrowUp size={18} strokeWidth={2.5} />
          </Button>
        </div>
        <p className="mt-2 hidden text-center text-[11px] text-fg/35 sm:block">Enter to send · Shift + Enter for a new line</p>
      </div>
    </div>
  );
}
