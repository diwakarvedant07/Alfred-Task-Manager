"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  useReactFlow,
  ReactFlowProvider,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getZoomTier } from "./zoomTier";
import { computeThreadCentroid } from "./layout";
import TaskNode from "./TaskNode";
import ThreadBubbleNode from "./ThreadBubbleNode";
import NewThreadButton from "./NewThreadButton";
import NewTaskButton from "./NewTaskButton";
import ShareThreadDialog from "./ShareThreadDialog";
import TaskDetailPanel from "@/components/task-detail/TaskDetailPanel";
import AccentColorPicker from "@/components/settings/AccentColorPicker";
import ThemeToggle from "@/components/settings/ThemeToggle";
import ModelPicker from "@/components/settings/ModelPicker";
import CatchUpModal from "./CatchUpModal";
import JarvisPanel from "@/components/jarvis/JarvisPanel";
import { themeToCssVariables } from "@/lib/theme";
import { saveTaskPosition } from "@/app/actions/taskPositions";
import {
  createThread,
  renameThread,
  changeThreadCategoryColor,
  closeThread,
  deleteThread,
} from "@/app/actions/threads";
import { createTask, updateTask, deleteTask, moveTaskToThread, linkSecondaryThread } from "@/app/actions/tasks";
import { shareThread, listThreadShares, revokeThreadShare } from "@/app/actions/threadShares";
import { addTaskUpdate, listTaskUpdates } from "@/app/actions/taskUpdates";
import { updateThemePreference } from "@/app/actions/theme";
import { openThreadAndMaybeGetCatchUp, getStoredThreadSummary } from "@/app/actions/threadCatchUp";
import { updatePreferredAiModel } from "@/app/actions/aiModel";
import { suggestTaskPriority } from "@/app/actions/taskPriority";

const nodeTypes = { task: TaskNode, threadBubble: ThreadBubbleNode };

type ThreadSummary = { id: string; name: string; categoryColor: string; role: "OWNER" | "EDITOR" | "VIEWER" };
type ThreadShareItem = {
  id: string;
  permission: "VIEWER" | "EDITOR";
  sharedWithUser: { name: string; email: string };
};
type TaskSummary = {
  id: string;
  primaryThreadId: string;
  title: string;
  description: string;
  workStatus: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH";
  priorityIsAiSuggested: boolean;
  dueDate: Date | null;
  updateCount: number;
};
type PositionMap = Record<string, { x: number; y: number }>;

function CanvasInner({
  threads,
  tasks,
  positions,
  themeMode,
  accentColor,
  preferredAiModel,
  initialTier,
  initialJarvisMessages,
}: {
  threads: ThreadSummary[];
  tasks: TaskSummary[];
  positions: PositionMap;
  themeMode: "LIGHT" | "DARK";
  accentColor: string;
  preferredAiModel: string;
  initialTier?: "BUBBLE" | "CARD";
  initialJarvisMessages: {
    id: string;
    role: "USER" | "ASSISTANT";
    content: string;
    toolCalls: { tool: string; success: boolean; summary: string }[] | null;
  }[];
}) {
  const { getZoom } = useReactFlow();
  const router = useRouter();
  const [tier, setTier] = useState<"BUBBLE" | "CARD">(initialTier ?? "CARD");
  // Controlled values for the settings strip's picker/toggle. Kept local so
  // the controls reflect a change the instant it's made, rather than
  // waiting on the updateThemePreference round-trip and a router.refresh()
  // of the layout that actually owns ThemeProvider.
  const [localThemeMode, setLocalThemeMode] = useState(themeMode);
  const [localAccentColor, setLocalAccentColor] = useState(accentColor);
  // Shares loaded per-thread, lazily, when that thread's Share dialog is
  // opened (listThreadShares is OWNER-only server-side, so this is only
  // ever wired up for threads the caller owns — see the ShareThreadDialog
  // usage below).
  const [threadShares, setThreadShares] = useState<Record<string, ThreadShareItem[]>>({});
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskUpdates, setSelectedTaskUpdates] = useState<
    { id: string; body: string; authorId: string; createdAt: Date }[]
  >([]);
  // Local, synchronous overrides for in-progress task edits, keyed by task
  // id. Server round-trips (updateTask calls) fire per keystroke and can
  // resolve out of order, so what's displayed must never depend on their
  // timing — only on the order these edits were made. These are persistent
  // per task (not scoped to "whichever task is currently open") so that
  // both the canvas node and the detail panel keep showing an edit after
  // the panel is closed and reopened, or a different task is selected and
  // this one is re-selected — not just while the panel that made the edit
  // is still open.
  //
  // Known limitation: an override is never automatically cleared once the
  // `tasks` prop catches up with it (e.g. via a later router.refresh() from
  // an unrelated action). For this project's current scope that's an
  // acceptable simplification rather than building full reconciliation —
  // the override always reflects the most recent edit made in this session,
  // which is what matters for the UI never appearing to revert.
  const [taskEditOverrides, setTaskEditOverrides] = useState<Record<string, Partial<TaskSummary>>>({});

  // Catch-up modal state: null means "not showing"; a non-null value with
  // `loading: true` renders the modal's loading state while the Server
  // Action for either the auto-triggered (thread click) or manual ("View
  // catch-up" menu item) path is in flight.
  const [catchUp, setCatchUp] = useState<{ summary: string | null; loading: boolean } | null>(null);
  // Controlled locally (mirroring the theme/accent pattern above) so the
  // settings strip's picker reflects a change immediately rather than
  // waiting on the updatePreferredAiModel round-trip.
  const [aiModel, setAiModel] = useState(preferredAiModel);

  const withOverride = useCallback(
    (task: TaskSummary): TaskSummary => ({ ...task, ...taskEditOverrides[task.id] }),
    [taskEditOverrides]
  );

  // Opens the detail panel for a task — shared by clicking the card and by
  // the card menu's "Rename" item (which reuses the panel's editable Title
  // field rather than duplicating a separate rename prompt).
  const openTask = useCallback(async (taskId: string) => {
    setSelectedTaskId(taskId);
    setSelectedTaskUpdates(await listTaskUpdates(taskId));
  }, []);

  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      await deleteTask(taskId);
      setSelectedTaskId((current) => (current === taskId ? null : current));
      router.refresh();
    },
    [router]
  );

  const handleMoveToThread = useCallback(
    async (taskId: string) => {
      const targetName = window.prompt("Move to which thread? Enter the thread name.");
      if (!targetName) return;
      const target = threads.find((t) => t.name === targetName);
      if (!target) {
        window.alert(`No thread named "${targetName}" found.`);
        return;
      }
      await moveTaskToThread(taskId, target.id);
      router.refresh();
    },
    [threads, router]
  );

  const handleLinkSecondaryThread = useCallback(
    async (taskId: string) => {
      const targetName = window.prompt("Link which secondary thread? Enter the thread name.");
      if (!targetName) return;
      const target = threads.find((t) => t.name === targetName);
      if (!target) {
        window.alert(`No thread named "${targetName}" found.`);
        return;
      }
      await linkSecondaryThread(taskId, target.id);
      router.refresh();
    },
    [threads, router]
  );

  // Thread-bubble menu handlers (the BUBBLE-tier equivalent of the task
  // card's handlers above). Simple prompts/confirms, matching the existing
  // window.prompt-based stopgaps used for onMoveToThread/onLinkSecondaryThread
  // above rather than a polished dialog.
  const handleRenameThread = useCallback(
    async (threadId: string) => {
      const current = threads.find((t) => t.id === threadId);
      const name = window.prompt("Rename thread to:", current?.name ?? "");
      if (!name) return;
      await renameThread(threadId, name);
      router.refresh();
    },
    [threads, router]
  );

  const handleChangeThreadColor = useCallback(
    async (threadId: string) => {
      const current = threads.find((t) => t.id === threadId);
      const color = window.prompt(
        "New category color (hex, e.g. #38e0ff):",
        current?.categoryColor ?? "#38e0ff"
      );
      if (!color) return;
      await changeThreadCategoryColor(threadId, color);
      router.refresh();
    },
    [threads, router]
  );

  const handleCloseThread = useCallback(
    async (threadId: string) => {
      if (!window.confirm("Close this thread (archive it)?")) return;
      await closeThread(threadId);
      router.refresh();
    },
    [router]
  );

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      if (!window.confirm("Delete this thread? Its tasks will move to the recycle bin too.")) return;
      await deleteThread(threadId);
      setSelectedTaskId((current) => {
        const currentTask = tasks.find((t) => t.id === current);
        return currentTask?.primaryThreadId === threadId ? null : current;
      });
      router.refresh();
    },
    [router, tasks]
  );

  // Opens the catch-up modal when a thread bubble is clicked. The server
  // decides whether there's anything worth showing (thread view staleness,
  // new activity since the last stored summary) — this just reflects that
  // decision, showing a loading state while it's in flight.
  const handleThreadBubbleClick = useCallback(async (threadId: string) => {
    setCatchUp({ summary: null, loading: true });
    try {
      const result = await openThreadAndMaybeGetCatchUp(threadId);
      if (result.showCatchUp) {
        setCatchUp({ summary: result.summary, loading: false });
      } else {
        setCatchUp(null);
      }
    } catch {
      // Without this, a rejected Server Action call left the "Catching you
      // up…" loading state showing indefinitely (only the × button to
      // escape) plus an unhandled promise rejection in the console. Surface
      // a clear error through the same modal instead of hanging forever.
      setCatchUp({
        summary: "Something went wrong loading your catch-up. Please try again.",
        loading: false,
      });
    }
  }, []);

  // The thread bubble's "View catch-up" menu item — same modal, but always
  // shows the last stored summary read-only rather than re-triggering the
  // staleness check/regeneration that clicking the bubble itself does.
  const handleViewStoredCatchUp = useCallback(async (threadId: string) => {
    setCatchUp({ summary: null, loading: true });
    try {
      const summary = await getStoredThreadSummary(threadId);
      setCatchUp({ summary: summary ?? "Nothing to catch up on yet.", loading: false });
    } catch {
      setCatchUp({
        summary: "Something went wrong loading your catch-up. Please try again.",
        loading: false,
      });
    }
  }, []);

  // listThreadShares/revokeThreadShare are OWNER-only server-side
  // (lib/permissions.ts canManageShares) — only wired up from the
  // ShareThreadDialog rendered for threads the caller owns, below.
  const handleLoadThreadShares = useCallback(async (threadId: string) => {
    const shares = await listThreadShares(threadId);
    setThreadShares((prev) => ({ ...prev, [threadId]: shares }));
  }, []);

  const handleRevokeThreadShare = useCallback(
    async (threadId: string, shareId: string) => {
      await revokeThreadShare(shareId);
      await handleLoadThreadShares(threadId);
    },
    [handleLoadThreadShares]
  );

  // Applies the CSS variables immediately (so the change is visible without
  // waiting on the Server Action + router.refresh() round-trip that
  // reconciles the layout-level ThemeProvider's own props), then persists
  // the preference and refreshes so a later navigation/reload is consistent.
  const handleThemeChange = useCallback(
    async (mode: "LIGHT" | "DARK", color: string) => {
      setLocalThemeMode(mode);
      setLocalAccentColor(color);
      const vars = themeToCssVariables(mode, color);
      for (const [key, value] of Object.entries(vars)) {
        document.documentElement.style.setProperty(key, value);
      }
      await updateThemePreference(mode, color);
      router.refresh();
    },
    [router]
  );

  const nodes = useMemo<Node[]>(() => {
    if (tier === "BUBBLE") {
      return threads.map((thread) => {
        const threadTaskPositions = tasks
          .filter((t) => t.primaryThreadId === thread.id)
          .map((t) => positions[t.id] ?? { x: 0, y: 0 })
          .map((p) => ({ positionX: p.x, positionY: p.y }));
        const centroid = computeThreadCentroid(threadTaskPositions);
        return {
          id: thread.id,
          type: "threadBubble",
          position: centroid,
          data: {
            name: thread.name,
            categoryColor: thread.categoryColor,
            onRename: () => handleRenameThread(thread.id),
            onChangeColor: () => handleChangeThreadColor(thread.id),
            onClose: () => handleCloseThread(thread.id),
            onDelete: () => handleDeleteThread(thread.id),
            onViewCatchUp: () => handleViewStoredCatchUp(thread.id),
            // lib/permissions.ts: canManageThreadMeta is OWNER+EDITOR,
            // canCloseOrDeleteThread is OWNER only.
            canEditMeta: thread.role === "OWNER" || thread.role === "EDITOR",
            canCloseOrDelete: thread.role === "OWNER",
          },
        };
      });
    }
    return tasks.map((task) => {
      const effective = withOverride(task);
      return {
        id: task.id,
        type: "task",
        position: positions[task.id] ?? { x: 0, y: 0 },
        data: {
          title: effective.title,
          workStatus: effective.workStatus,
          priority: effective.priority,
          priorityIsAiSuggested: effective.priorityIsAiSuggested,
          updateCount: effective.updateCount,
          onRename: () => openTask(task.id),
          onMoveToThread: () => handleMoveToThread(task.id),
          onLinkSecondaryThread: () => handleLinkSecondaryThread(task.id),
          onDelete: () => handleDeleteTask(task.id),
        },
      };
    });
  }, [
    tier,
    threads,
    tasks,
    positions,
    withOverride,
    openTask,
    handleMoveToThread,
    handleLinkSecondaryThread,
    handleDeleteTask,
    handleRenameThread,
    handleChangeThreadColor,
    handleCloseThread,
    handleDeleteThread,
    handleViewStoredCatchUp,
  ]);

  const handleMoveEnd = useCallback(() => {
    setTier(getZoomTier(getZoom()));
  }, [getZoom]);

  const handleNodeDragStop = useCallback((_: unknown, node: Node) => {
    if (node.type === "task") {
      void saveTaskPosition(node.id, node.position.x, node.position.y);
    }
  }, []);

  const handleNodeClick = useCallback(
    async (_: unknown, node: Node) => {
      if (node.type === "threadBubble") {
        void handleThreadBubbleClick(node.id);
        return;
      }
      if (node.type !== "task") return;
      await openTask(node.id);
    },
    [openTask, handleThreadBubbleClick]
  );

  const handleCreateThread = useCallback(
    async (input: { name: string; categoryColor: string }) => {
      await createThread(input);
      router.refresh();
    },
    [router]
  );

  const handleCreateTask = useCallback(
    async (threadId: string, input: { title: string; description?: string; dueDate?: Date }) => {
      const created = await createTask({ primaryThreadId: threadId, ...input });
      router.refresh();

      // Fire-and-forget: the AI priority suggestion is a background
      // enhancement, not part of the creation flow the user waits on. Apply
      // its result to the same per-task override state used for in-progress
      // edits once it resolves; swallow failures silently so a slow/failing
      // AI call never surfaces as an error for what is otherwise a
      // successful task creation — the task simply keeps its default
      // MEDIUM priority.
      void suggestTaskPriority(created.id)
        .then((updated) => {
          setTaskEditOverrides((prev) => ({
            ...prev,
            [created.id]: {
              ...prev[created.id],
              priority: updated.priority,
              priorityIsAiSuggested: updated.priorityIsAiSuggested,
            },
          }));
        })
        .catch(() => {
          // Priority suggestion is a background enhancement — failures are
          // silent by design, the task keeps its default MEDIUM priority.
        });
    },
    [router]
  );

  const handleShareThread = useCallback(
    async (threadId: string, email: string, permission: "VIEWER" | "EDITOR") => {
      await shareThread(threadId, email, permission);
      router.refresh();
    },
    [router]
  );

  const baseSelectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
  const selectedTask = baseSelectedTask ? withOverride(baseSelectedTask) : null;
  const selectedTaskThread = selectedTask
    ? threads.find((t) => t.id === selectedTask.primaryThreadId)
    : undefined;
  // Viewers can comment but not edit task fields (server-enforced too, via
  // requireTaskManageRole in the updateTask action) — disable the editable
  // controls in the panel so that's visible, not just rejected silently.
  const canEditSelectedTask = selectedTaskThread ? selectedTaskThread.role !== "VIEWER" : true;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div style={{ position: "absolute", top: 8, left: 8, zIndex: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <NewThreadButton onCreate={handleCreateThread} />
        {threads.map((thread) => (
          <div key={thread.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span>{thread.name}</span>
            <NewTaskButton
              threadId={thread.id}
              onCreate={(input) => handleCreateTask(thread.id, input)}
            />
            {/* Sharing (invite/list/revoke) is OWNER-only server-side
                (lib/permissions.ts canManageShares) — the whole dialog is
                hidden for an EDITOR/VIEWER rather than shown and rejected. */}
            {thread.role === "OWNER" && (
              <ShareThreadDialog
                threadId={thread.id}
                onShare={(email, permission) => handleShareThread(thread.id, email, permission)}
                onOpen={() => handleLoadThreadShares(thread.id)}
                shares={threadShares[thread.id] ?? []}
                onRevoke={(shareId) => handleRevokeThreadShare(thread.id, shareId)}
              />
            )}
          </div>
        ))}
      </div>

      <div style={{ position: "absolute", top: 8, right: 8, zIndex: 10, display: "flex", alignItems: "center", gap: 12 }}>
        <AccentColorPicker
          value={localAccentColor}
          onChange={(hex) => handleThemeChange(localThemeMode, hex)}
        />
        <ThemeToggle
          value={localThemeMode}
          onChange={(mode) => handleThemeChange(mode, localAccentColor)}
        />
        <ModelPicker
          value={aiModel}
          onChange={async (model) => {
            setAiModel(model);
            await updatePreferredAiModel(model);
          }}
        />
      </div>

      <ReactFlow
        nodes={nodes}
        nodeTypes={nodeTypes}
        onMoveEnd={handleMoveEnd}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={handleNodeClick}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>

      {catchUp && (
        <CatchUpModal
          summary={catchUp.summary}
          loading={catchUp.loading}
          onClose={() => setCatchUp(null)}
        />
      )}

      {selectedTask && (
        <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 360, zIndex: 20, overflowY: "auto" }}>
          <TaskDetailPanel
            task={selectedTask}
            updates={selectedTaskUpdates}
            canEdit={canEditSelectedTask}
            onUpdateTask={async (patch) => {
              // Apply synchronously so the displayed value always reflects
              // the most recently typed edit, regardless of how long the
              // Server Action call below takes or the order responses land
              // in. Keyed by task id and never cleared on close/re-select,
              // so the canvas node and a reopened panel both keep showing
              // the edit instead of falling back to the stale `tasks` prop.
              //
              // Mirrors app/actions/tasks.ts updateTask's own rule: a manual
              // priority change always clears priorityIsAiSuggested. Without
              // this, the local override only patched `priority`, so the AI
              // badge kept showing (reading the stale
              // priorityIsAiSuggested: true left over from the earlier
              // suggestTaskPriority override) until the next router.refresh()
              // reconciled it with the server's now-correct value — visibly
              // wrong for a manual override that's supposed to clear the
              // badge immediately.
              const taskId = selectedTask.id;
              const overridePatch = "priority" in patch ? { ...patch, priorityIsAiSuggested: false } : patch;
              setTaskEditOverrides((prev) => ({
                ...prev,
                [taskId]: { ...prev[taskId], ...overridePatch },
              }));
              try {
                await updateTask(taskId, patch);
              } catch {
                // The panel disables editing controls for viewers, so this
                // only fires if the server's own permission check (the
                // authoritative one) rejects something the client allowed —
                // swallow rather than crash the canvas.
              }
            }}
            onAddComment={async (body) => {
              await addTaskUpdate(selectedTask.id, body);
              setSelectedTaskUpdates(await listTaskUpdates(selectedTask.id));
            }}
            onClose={() => setSelectedTaskId(null)}
          />
        </div>
      )}

      <JarvisPanel initialMessages={initialJarvisMessages} />
    </div>
  );
}

export default function Canvas(props: {
  threads: ThreadSummary[];
  tasks: TaskSummary[];
  positions: PositionMap;
  themeMode: "LIGHT" | "DARK";
  accentColor: string;
  preferredAiModel: string;
  // Seeds the initial zoom tier — primarily so tests can render straight
  // into the BUBBLE tier (thread bubbles) without simulating a real
  // ReactFlow zoom gesture, which jsdom can't do. Defaults to "CARD",
  // matching the previous hardcoded initial state.
  initialTier?: "BUBBLE" | "CARD";
  initialJarvisMessages: {
    id: string;
    role: "USER" | "ASSISTANT";
    content: string;
    toolCalls: { tool: string; success: boolean; summary: string }[] | null;
  }[];
}) {
  return (
    <div style={{ width: "100%", height: "100vh", background: "var(--bg)" }}>
      <ReactFlowProvider>
        <CanvasInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
