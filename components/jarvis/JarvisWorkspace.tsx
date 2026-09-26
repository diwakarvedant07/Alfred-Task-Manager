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
      if (e.key !== "Escape") return;
      // A Modal (e.g. "New Thread"/"Share", triggered from the canvas strip
      // alongside this workspace) also listens for Escape on `document`. If
      // one is open, let it handle the key and close itself only -- without
      // this check, one Escape press closed both the dialog and this whole
      // workspace. Modal.tsx's dialog always carries both attributes.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // A generic, user-visible fallback for the session-management handlers
  // below -- mirrors Canvas.tsx's handleThreadBubbleClick pattern of
  // catching a failed Server Action and surfacing it via the same `error`
  // state used elsewhere, instead of letting it become a silent unhandled
  // rejection.
  const FAILURE_MESSAGE = "Couldn't reach Jarvis — please try again.";

  async function handleNewChat() {
    try {
      const created = await createJarvisSession();
      await refreshSessions();
      await loadSession(created.id);
    } catch {
      setError(FAILURE_MESSAGE);
    }
  }

  async function handleSelect(sessionId: string) {
    if (sessionId === activeSessionId) return;
    try {
      await loadSession(sessionId);
    } catch {
      setError(FAILURE_MESSAGE);
    }
  }

  async function handleRename(sessionId: string, title: string) {
    try {
      await renameJarvisSession(sessionId, title);
      await refreshSessions();
    } catch {
      setError(FAILURE_MESSAGE);
    }
  }

  async function handleDelete(sessionId: string) {
    try {
      await deleteJarvisSession(sessionId);
      const remaining = sessions.filter((s) => s.id !== sessionId);
      await refreshSessions();
      if (activeSessionId === sessionId) {
        await loadSession(remaining[0]?.id ?? null);
      }
    } catch {
      setError(FAILURE_MESSAGE);
    }
  }

  async function handleRenameActiveSession(title: string) {
    if (!activeSessionId) return;
    await handleRename(activeSessionId, title);
  }

  // Returns whether the send succeeded, so JarvisChat can restore the
  // user's typed draft on failure instead of losing it.
  async function handleSend(text: string): Promise<boolean> {
    setError(null);
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: `pending-user-${Date.now()}`, role: "USER", content: text, toolCalls: null, totalTokens: null },
    ]);
    try {
      let sessionId = activeSessionId;
      if (!sessionId) {
        // Moved inside this try (rather than ahead of it) so a failure
        // creating the session is caught by the same catch/finally as
        // everything else below -- previously this sat outside the try
        // block entirely, so a rejection here escaped handleSend with no
        // error shown, `sending` never reset, and the draft already
        // cleared.
        const created = await createJarvisSession();
        sessionId = created.id;
        setActiveSessionId(sessionId);
        await refreshSessions();
      }
      await sendJarvisMessage(sessionId, text);
      const raw = await listJarvisMessages(sessionId);
      setMessages(raw.map(toMessageView));
      await refreshSessions();
      // Tool calls (creating/updating threads and tasks) don't otherwise
      // reach the canvas's server-rendered props -- this is what makes the
      // right-side canvas preview actually live.
      router.refresh();
      return true;
    } catch {
      setError(FAILURE_MESSAGE);
      setMessages((prev) => prev.filter((m) => !m.id.startsWith("pending-user-")));
      return false;
    } finally {
      setSending(false);
    }
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  return (
    // right-[max(38%,360px)] reserves exactly the width Canvas.tsx's resized
    // canvas strip occupies (w-[max(38%,360px)]) instead of overlapping it --
    // both were previously `inset-0`/`w-[38%] min-w-[360px]` sized
    // independently, so the canvas (a higher z-index, since it must also
    // clear catch-up/task-detail overlays) visually and interactively sat on
    // top of this pane's own right edge, silently blocking clicks on
    // anything positioned there (e.g. JarvisChat's Close button).
    // Below `md` there's no room for the side-by-side canvas preview, so the
    // workspace goes full-width (Canvas.tsx hides the strip at that size).
    <div className="fixed inset-y-0 left-0 right-0 z-[110] flex animate-fade-in bg-canvas md:right-[max(38%,360px)]">
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
        onNewChat={handleNewChat}
      />
    </div>
  );
}
