"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  useReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getZoomTier, ZOOM_TIER_THRESHOLD } from "./zoomTier";
import { computeThreadCentroid, computeInitialTaskOffset, computeInitialThreadOffset } from "./layout";
import TaskNode from "./TaskNode";
import ThreadBubbleNode from "./ThreadBubbleNode";
import ThreadsPanel from "./ThreadsPanel";
import TaskListView from "./TaskListView";
import { LayoutGrid, List } from "lucide-react";
import { useIsMobile } from "@/lib/useIsMobile";
import Orb from "@/components/ui/Orb";
import TaskDetailPanel from "@/components/task-detail/TaskDetailPanel";
import CatchUpModal from "./CatchUpModal";
import JarvisPanel from "@/components/jarvis/JarvisPanel";
import JarvisWorkspace from "@/components/jarvis/JarvisWorkspace";
import type { JarvisSessionSummary } from "@/components/jarvis/JarvisSessionList";
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
import { openThreadAndMaybeGetCatchUp, getStoredThreadSummary } from "@/app/actions/threadCatchUp";
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
  initialTier,
  initialJarvisSessions,
}: {
  threads: ThreadSummary[];
  tasks: TaskSummary[];
  positions: PositionMap;
  initialTier?: "BUBBLE" | "CARD";
  initialJarvisSessions: JarvisSessionSummary[];
}) {
  const { getZoom, fitView } = useReactFlow();
  const router = useRouter();
  const [tier, setTier] = useState<"BUBBLE" | "CARD">(initialTier ?? "CARD");
  const [jarvisWorkspaceOpen, setJarvisWorkspaceOpen] = useState(false);
  // Phones get a thread-grouped list by default — dragging cards around a
  // free-form canvas with a thumb is fiddly — with a toggle back to the
  // canvas itself. Ignored on wider screens, which always show the canvas.
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState<"list" | "canvas">("list");
  const showList = isMobile && mobileView === "list";
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

  // Tasks with no saved position for this user (e.g. tasks in a thread
  // shared with them, or created by Jarvis) used to all render at {0, 0},
  // stacked into one unreadable pile. Lay them out on the same per-thread
  // grid createTask uses for a new task's initial position instead. Purely
  // a display default: nothing is persisted until the user drags a card.
  const effectivePositions = useMemo<PositionMap>(() => {
    const result: PositionMap = { ...positions };
    const threadIndex = new Map(threads.map((t, i) => [t.id, i]));
    const nextIndexInThread = new Map<string, number>();
    for (const task of tasks) {
      if (result[task.id]) continue;
      const indexInThread = nextIndexInThread.get(task.primaryThreadId) ?? 0;
      nextIndexInThread.set(task.primaryThreadId, indexInThread + 1);
      const taskOffset = computeInitialTaskOffset(indexInThread);
      const threadOffset = computeInitialThreadOffset(threadIndex.get(task.primaryThreadId) ?? threads.length);
      result[task.id] = { x: threadOffset.x + taskOffset.x, y: threadOffset.y + taskOffset.y };
    }
    return result;
  }, [positions, tasks, threads]);

  const taskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const task of tasks) counts[task.primaryThreadId] = (counts[task.primaryThreadId] ?? 0) + 1;
    return counts;
  }, [tasks]);

  const nodes = useMemo<Node[]>(() => {
    if (tier === "BUBBLE") {
      return threads.map((thread) => {
        const threadTaskPositions = tasks
          .filter((t) => t.primaryThreadId === thread.id)
          .map((t) => effectivePositions[t.id] ?? { x: 0, y: 0 })
          .map((p) => ({ positionX: p.x, positionY: p.y }));
        const centroid = computeThreadCentroid(threadTaskPositions);
        return {
          id: thread.id,
          type: "threadBubble",
          position: centroid,
          data: {
            name: thread.name,
            categoryColor: thread.categoryColor,
            taskCount: taskCounts[thread.id] ?? 0,
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
    const threadColorById = new Map(threads.map((t) => [t.id, t.categoryColor]));
    return tasks.map((task) => {
      const effective = withOverride(task);
      return {
        id: task.id,
        type: "task",
        position: effectivePositions[task.id] ?? { x: 0, y: 0 },
        data: {
          threadColor: threadColorById.get(task.primaryThreadId),
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
    effectivePositions,
    taskCounts,
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

  // ReactFlow's `nodes` prop is "controlled" (there's no `defaultNodes`
  // escape hatch here), which means ReactFlow only applies a drag's
  // position updates if we hand it back through `onNodesChange` -- without
  // this, `updateNodePositions` computes the dragged-to position and then
  // discards it, so cards never visibly move while dragging. Local state
  // mirrors the derived `nodes` (server truth), and `onNodesChange` folds
  // ReactFlow's own change events (drag, selection) into it in between.
  //
  // The resync effect below depends on the underlying state/props
  // (tier/threads/tasks/positions/taskEditOverrides) rather than on `nodes`
  // itself: `nodes` is a useMemo whose inputs include callbacks closing
  // over `router`, and `useRouter()` isn't guaranteed to return the same
  // object across renders (this project's own test mock returns a fresh
  // object every call) -- depending on `nodes`'s identity directly made
  // this effect re-fire on every render, which set state every render,
  // which triggered another render: an infinite loop that OOM'd the
  // process. The values below only change when something real changed.
  const [localNodes, setLocalNodes] = useState<Node[]>(nodes);
  useEffect(() => {
    setLocalNodes(nodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, threads, tasks, effectivePositions, taskEditOverrides]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setLocalNodes((current) => applyNodeChanges(changes, current));
  }, []);

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

  // Clicking a thread in the threads panel pans/zooms the canvas to that
  // thread's cards (switching out of the zoomed-out bubble tier first,
  // since task nodes only exist in the CARD tier).
  const handleFocusThread = useCallback(
    (threadId: string) => {
      const taskIds = tasks.filter((t) => t.primaryThreadId === threadId).map((t) => ({ id: t.id }));
      if (taskIds.length === 0) return;
      setMobileView("canvas");
      setTier("CARD");
      // Give React Flow a frame to mount/measure the CARD-tier nodes.
      window.setTimeout(() => {
        void fitView({ nodes: taskIds, duration: 600, padding: 0.35, maxZoom: 1.1 });
      }, 60);
    },
    [tasks, fitView]
  );

  // "J" opens Jarvis from anywhere on the canvas — ignored while typing in
  // a field, with a modifier held, or while a dialog is open.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "j" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      e.preventDefault();
      setJarvisWorkspaceOpen(true);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const baseSelectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
  const selectedTask = baseSelectedTask ? withOverride(baseSelectedTask) : null;
  const selectedTaskThread = selectedTask
    ? threads.find((t) => t.id === selectedTask.primaryThreadId)
    : undefined;
  // Viewers can comment but not edit task fields (server-enforced too, via
  // requireTaskManageRole in the updateTask action) — disable the editable
  // controls in the panel so that's visible, not just rejected silently.
  const canEditSelectedTask = selectedTaskThread ? selectedTaskThread.role !== "VIEWER" : true;

  // Shared by the desktop side rail and the phone bottom sheet below.
  const taskDetailPanel = (task: TaskSummary) => (
    <TaskDetailPanel
      task={task}
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
        const taskId = task.id;
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
        await addTaskUpdate(task.id, body);
        setSelectedTaskUpdates(await listTaskUpdates(task.id));
      }}
      onClose={() => setSelectedTaskId(null)}
    />
  );

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* Toolbar and ReactFlow are resized together as one unit -- when the
          Jarvis workspace is open, this whole region shrinks into a
          right-pinned strip via `fixed` positioning (which also makes it a
          containing block for the toolbar's `position: absolute` below, so
          "top:8 left:8" anchors to this strip, not the full viewport) rather
          than the ReactFlow canvas alone, so the toolbar stays visually
          attached to it instead of floating disconnected at the old
          top-left. The SAME <ReactFlow> element is reused either way (no
          remount), so pan/zoom state survives opening and closing Jarvis. */}
      <div
        className={
          jarvisWorkspaceOpen
            ? "fixed inset-y-0 right-0 z-[115] hidden w-[max(38%,360px)] border-l border-fg/10 bg-canvas md:block"
            : "absolute inset-0"
        }
      >
        {isMobile && !jarvisWorkspaceOpen && (
          <div
            role="group"
            aria-label="View"
            className="glass elevated absolute left-1/2 top-3 z-20 flex -translate-x-1/2 gap-0.5 rounded-full p-1"
          >
            {(
              [
                { value: "list", label: "List", icon: List },
                { value: "canvas", label: "Canvas", icon: LayoutGrid },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={mobileView === value}
                onClick={() => setMobileView(value)}
                className={`flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors ${
                  mobileView === value ? "bg-accent/15 text-accent" : "text-fg/60"
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        )}

        {showList && (
          <TaskListView
            threads={threads}
            tasks={tasks.map(withOverride)}
            threadShares={threadShares}
            selectedTaskId={selectedTaskId}
            onOpenTask={openTask}
            onCreateThread={handleCreateThread}
            onCreateTask={handleCreateTask}
            onShareThread={handleShareThread}
            onLoadThreadShares={handleLoadThreadShares}
            onRevokeThreadShare={handleRevokeThreadShare}
            onMoveToThread={handleMoveToThread}
            onLinkSecondaryThread={handleLinkSecondaryThread}
            onDeleteTask={handleDeleteTask}
            onRenameThread={handleRenameThread}
            onChangeThreadColor={handleChangeThreadColor}
            onCloseThread={handleCloseThread}
            onDeleteThread={handleDeleteThread}
            onViewCatchUp={handleViewStoredCatchUp}
          />
        )}

        <div className={`absolute left-3 z-10 ${isMobile ? "top-16" : "top-3"} ${showList ? "hidden" : ""}`}>
          <ThreadsPanel
            key={isMobile ? "mobile" : "desktop"}
            defaultCollapsed={isMobile}
            threads={threads}
            taskCounts={taskCounts}
            threadShares={threadShares}
            onCreateThread={handleCreateThread}
            onCreateTask={handleCreateTask}
            onShareThread={handleShareThread}
            onLoadThreadShares={handleLoadThreadShares}
            onRevokeThreadShare={handleRevokeThreadShare}
            onFocusThread={handleFocusThread}
          />
        </div>

        {threads.length === 0 && !showList && (
          <div className="pointer-events-none absolute inset-0 z-[5] flex animate-rise flex-col items-center justify-center gap-4 px-6 text-center">
            <Orb state="shaping" size={88} />
            <div>
              <p className="text-lg font-semibold tracking-tight text-fg">Your canvas is empty</p>
              <p className="mt-1 max-w-sm text-sm text-fg/55">
                Create a thread to start adding tasks — or{" "}
                {isMobile ? (
                  "tap the orb"
                ) : (
                  <>
                    press{" "}
                    <kbd className="rounded-md border border-fg/15 bg-fg/[0.06] px-1.5 py-0.5 font-mono text-xs">J</kbd>
                  </>
                )}{" "}
                and ask Jarvis to set things up for you.
              </p>
            </div>
          </div>
        )}

        {/* Unmounted (not just hidden) in the phone list view: React Flow
            can't measure nodes inside a display:none box, so switching back
            would leave fitView working from zero-size nodes. */}
        {!showList && (
          <ReactFlow
            nodes={localNodes}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onMoveEnd={handleMoveEnd}
            onNodeDragStop={handleNodeDragStop}
            onNodeClick={handleNodeClick}
            fitView
            // A phone-width fit usually lands below the card tier, where
            // the thread bubbles pile on top of each other — start phones
            // at readable cards instead and let them pan.
            fitViewOptions={{ padding: 0.3, maxZoom: 1.1, minZoom: isMobile ? ZOOM_TIER_THRESHOLD : undefined }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
            <Controls position="bottom-left" showInteractive={false} />
          </ReactFlow>
        )}
      </div>

      {catchUp && (
        <CatchUpModal
          summary={catchUp.summary}
          loading={catchUp.loading}
          onClose={() => setCatchUp(null)}
        />
      )}

      {selectedTask && isMobile && (
        // Phones: a bottom sheet over a dimmed backdrop instead of the
        // side rail, which would otherwise cover the whole screen edge to
        // edge with no visible way back to the list behind it.
        <div
          className="fit-visible-viewport fixed inset-0 z-[130] flex animate-fade-in flex-col bg-black/45 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedTaskId(null);
          }}
        >
          <div key={selectedTask.id} className="mt-auto h-[min(92dvh,100%)] animate-slide-up">
            {taskDetailPanel(selectedTask)}
          </div>
        </div>
      )}

      {selectedTask && !isMobile && (
        <div
          key={selectedTask.id}
          className="animate-slide-in-right"
          style={{
            position: "absolute",
            top: 12,
            // When the Jarvis workspace is open, the canvas strip
            // (z-[115]) sits on top of this rail's usual zIndex: 20, so a
            // task opened from the canvas preview was rendered but
            // invisible, docked behind the strip. Bump above it (matching
            // the z-[120] pattern already used for panels that must clear
            // the canvas strip) and dock against the strip's left edge
            // instead of the viewport's right edge so the rail doesn't
            // overlap the canvas either.
            right: jarvisWorkspaceOpen ? "max(38%, 360px)" : "calc(12px + env(safe-area-inset-right))",
            bottom: 12,
            width: "min(380px, calc(100% - 24px))",
            zIndex: jarvisWorkspaceOpen ? 120 : 20,
            overflowY: "auto",
          }}
        >
          {taskDetailPanel(selectedTask)}
        </div>
      )}

      {!jarvisWorkspaceOpen && (
        // Slides left of the task-detail rail while it's open, so it no
        // longer sits on top of the rail's "Post update" button.
        <JarvisPanel onOpen={() => setJarvisWorkspaceOpen(true)} shifted={selectedTask !== null && !isMobile} />
      )}
      {jarvisWorkspaceOpen && (
        <JarvisWorkspace initialSessions={initialJarvisSessions} onClose={() => setJarvisWorkspaceOpen(false)} />
      )}
    </div>
  );
}

export default function Canvas(props: {
  threads: ThreadSummary[];
  tasks: TaskSummary[];
  positions: PositionMap;
  // Seeds the initial zoom tier — primarily so tests can render straight
  // into the BUBBLE tier (thread bubbles) without simulating a real
  // ReactFlow zoom gesture, which jsdom can't do. Defaults to "CARD",
  // matching the previous hardcoded initial state.
  initialTier?: "BUBBLE" | "CARD";
  initialJarvisSessions: JarvisSessionSummary[];
}) {
  return (
    // Fills <main> (below the navbar) rather than 100vh, which overflowed
    // the page by the navbar's height and pushed the zoom controls offscreen.
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <ReactFlowProvider>
        <CanvasInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
