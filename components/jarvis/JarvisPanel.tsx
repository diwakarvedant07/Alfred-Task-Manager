"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 20 }}>
      <button aria-label="Jarvis" onClick={() => setOpen((o) => !o)}>
        ◈ JARVIS
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Jarvis chat"
          style={{
            width: 320,
            maxHeight: 420,
            display: "flex",
            flexDirection: "column",
            background: "var(--panel-bg)",
            color: "var(--text)",
          }}
        >
          <div style={{ flex: 1, overflowY: "auto" }}>
            {messages.map((m) => (
              <div key={m.id} data-testid="jarvis-message">
                <strong>{m.role === "USER" ? "You" : "Jarvis"}:</strong> {m.content}
                {m.toolCalls?.map((c, i) => (
                  <div key={i}>
                    {c.success ? "✓" : "✗"} {c.summary}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {error && <div role="alert">{error}</div>}
          <textarea
            aria-label="Message Jarvis"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={sending}
          />
          <button onClick={handleSend} disabled={sending}>
            Send
          </button>
        </div>
      )}
    </div>
  );
}
