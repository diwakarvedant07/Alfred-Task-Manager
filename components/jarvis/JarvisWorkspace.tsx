"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import JarvisSessionList, { type JarvisSessionSummary } from "./JarvisSessionList";
import JarvisChat, { type JarvisMessageView } from "./JarvisChat";
import {
  createJarvisSession,
  listJarvisSessions,
  renameJarvisSession,
  deleteJarvisSession,
  listJarvisMessages,
} from "@/app/actions/jarvisSessions";
import { sendJarvisMessage } from "@/app/actions/jarvis";

function toMessageView(raw: {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  toolCalls: unknown;
  totalTokens: number | null;
}): JarvisMessageView {
  return {
    id: raw.id,
    role: raw.role,
    content: raw.content,
    toolCalls: raw.toolCalls as { tool: string; success: boolean; summary: string }[] | null,
    totalTokens: raw.totalTokens,
  };
}

export default function JarvisWorkspace({
  initialSessions,
  onClose,
}: {
  initialSessions: JarvisSessionSummary[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<JarvisSessionSummary[]>(initialSessions);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(initialSessions[0]?.id ?? null);
  const [messages, setMessages] = useState<JarvisMessageView[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSessions = useCallback(async () => {
    setSessions(await listJarvisSessions());
  }, []);

  const loadSession = useCallback(async (sessionId: string | null) => {
    setActiveSessionId(sessionId);
    setError(null);
    if (sessionId === null) {
      setMessages([]);
      return;
    }
    const raw = await listJarvisMessages(sessionId);
    setMessages(raw.map(toMessageView));
  }, []);

  // Loads the initially-active session's messages once on mount. Session
  // switches afterward go through handleSelect, not this effect.
  useEffect(() => {
    if (activeSessionId) void loadSession(activeSessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleNewChat() {
    const created = await createJarvisSession();
    await refreshSessions();
    await loadSession(created.id);
  }

  async function handleSelect(sessionId: string) {
    if (sessionId === activeSessionId) return;
    await loadSession(sessionId);
  }

  async function handleRename(sessionId: string, title: string) {
    await renameJarvisSession(sessionId, title);
    await refreshSessions();
  }

  async function handleDelete(sessionId: string) {
    await deleteJarvisSession(sessionId);
    const remaining = sessions.filter((s) => s.id !== sessionId);
    await refreshSessions();
    if (activeSessionId === sessionId) {
      await loadSession(remaining[0]?.id ?? null);
    }
  }

  async function handleRenameActiveSession(title: string) {
    if (!activeSessionId) return;
    await handleRename(activeSessionId, title);
  }

  async function handleSend(text: string) {
    let sessionId = activeSessionId;
    if (!sessionId) {
      const created = await createJarvisSession();
      sessionId = created.id;
      setActiveSessionId(sessionId);
      await refreshSessions();
    }
    setError(null);
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: `pending-user-${Date.now()}`, role: "USER", content: text, toolCalls: null, totalTokens: null },
    ]);
    try {
      await sendJarvisMessage(sessionId, text);
      const raw = await listJarvisMessages(sessionId);
      setMessages(raw.map(toMessageView));
      await refreshSessions();
      // Tool calls (creating/updating threads and tasks) don't otherwise
      // reach the canvas's server-rendered props -- this is what makes the
      // right-side canvas preview actually live.
      router.refresh();
    } catch {
      setError("Couldn't reach Jarvis — please try again.");
      setMessages((prev) => prev.filter((m) => !m.id.startsWith("pending-user-")));
    } finally {
      setSending(false);
    }
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  return (
    <div className="fixed inset-0 z-[110] flex bg-[var(--bg,#0a0e14)]">
      <JarvisSessionList
        sessions={sessions}
        activeSessionId={activeSessionId}
        onNewChat={handleNewChat}
        onSelect={handleSelect}
        onRename={handleRename}
        onDelete={handleDelete}
      />
      <JarvisChat
        sessionTitle={activeSession?.title ?? null}
        messages={messages}
        sending={sending}
        error={error}
        onSend={handleSend}
        onRenameSession={handleRenameActiveSession}
        onClose={onClose}
      />
    </div>
  );
}
