"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import { sendJarvisMessage } from "@/app/actions/jarvis";

type ChipEntry = { tool: string; success: boolean; summary: string };
type JarvisMessageView = { id: string; role: "USER" | "ASSISTANT"; content: string; toolCalls: ChipEntry[] | null };

export default function JarvisPanel({ initialMessages }: { initialMessages: JarvisMessageView[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<JarvisMessageView[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setError(null);
    setSending(true);
    try {
      const { userMessage, assistantMessage } = await sendJarvisMessage(text);
      setMessages((prev) => [
        ...prev,
        { id: userMessage.id, role: "USER", content: userMessage.content, toolCalls: null },
        {
          id: assistantMessage.id,
          role: "ASSISTANT",
          content: assistantMessage.content,
          toolCalls: (assistantMessage.toolCalls as ChipEntry[] | null) ?? null,
        },
      ]);
      router.refresh();
    } catch {
      setError("Couldn't reach Jarvis — please try again.");
      setDraft(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-30 flex flex-col items-end gap-3">
      {open && (
        <div
          role="dialog"
          aria-label="Jarvis chat"
          className="flex h-[420px] w-80 flex-col overflow-hidden rounded-2xl border border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] shadow-2xl"
        >
          <div className="flex items-center gap-2 border-b border-[var(--text,#eafcff)]/10 px-4 py-3">
            <Sparkles size={16} className="text-[var(--accent,#38e0ff)]" />
            <span className="text-sm font-semibold text-[var(--text,#eafcff)]">Jarvis</span>
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
            {messages.map((m) => (
              <div
                key={m.id}
                data-testid="jarvis-message"
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
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
              </div>
            ))}
          </div>
          {error && (
            <div role="alert" className="mx-3 mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-[var(--text,#eafcff)]">
              {error}
            </div>
          )}
          <div className="flex items-end gap-2 border-t border-[var(--text,#eafcff)]/10 p-3">
            <Textarea
              label="Message Jarvis"
              hideLabel
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={sending}
              rows={1}
              className="min-h-[40px] flex-1 resize-none"
            />
            <Button onClick={handleSend} disabled={sending} className="shrink-0">
              Send
            </Button>
          </div>
        </div>
      )}
      <button
        aria-label="Jarvis"
        onClick={() => setOpen((o) => !o)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent,#38e0ff)] text-[#04121a] shadow-2xl transition-transform hover:scale-105"
      >
        <Sparkles size={22} />
      </button>
    </div>
  );
}
