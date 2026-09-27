"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  ControlButton,
  useReactFlow,
  useStoreApi,
  ReactFlowProvider,
  applyNodeChanges,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import ThreadClusterNode, { type ThreadClusterData } from "./ThreadClusterNode";
import { clusterLayout, type ClusterLayout } from "./clusterLayout";
import { COLLAPSED_DIAMETER, cameraZoomForCluster, clustersOverlap, defaultThreadPosition } from "./threadLayout";
import { useOpenThreads } from "./useOpenThreads";
import { mergeNodes } from "./mergeNodes";
import { useSmoothWheelZoom } from "./useSmoothWheelZoom";
import ThreadsPanel from "./ThreadsPanel";
import TaskListView from "./TaskListView";
import { LayoutGrid, List, Maximize, Minus, Plus } from "lucide-react";
import { useIsMobile } from "@/lib/useIsMobile";
import Orb from "@/components/ui/Orb";
import TaskDetailPanel from "@/components/task-detail/TaskDetailPanel";
import CatchUpModal from "./CatchUpModal";
import JarvisPanel from "@/components/jarvis/JarvisPanel";
import JarvisWorkspace from "@/components/jarvis/JarvisWorkspace";
import JarvisLauncherTransition, { type LauncherOrigin } from "@/components/jarvis/JarvisLauncherTransition";
import type { JarvisSessionSummary } from "@/components/jarvis/JarvisSessionList";
import { saveThreadPosition } from "@/app/actions/threadPositions";
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

const nodeTypes = { threadCluster: ThreadClusterNode };

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
  threadPositions,
  userId,
  initialJarvisSessions,
}: {
  threads: ThreadSummary[];
  tasks: TaskSummary[];
  threadPositions: PositionMap;
  userId: string;
  initialJarvisSessions: JarvisSessionSummary[];
}) {
  const { getZoom, setCenter, fitView, zoomIn, zoomOut } = useReactFlow();
  const store = useStoreApi();
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const openThreads = useOpenThreads(userId);
  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null);
  // Positions of threads dragged this session. Overlaid on the server's
  // threadPositions, which don't refresh after a drag, so re-deriving the
  // nodes (opening a thread, hovering) never snaps a thread back.
  const [draggedPositions, setDraggedPositions] = useState<PositionMap>({});
  // Timestamp of the last drag end, used to ignore the click that some
  // browsers deliver at the end of a drag.
  const lastDragEndRef = useRef(0);
  const flowRef = useRef<HTMLDivElement | null>(null);
  useSmoothWheelZoom(flowRef, { minZoom: 0.2, maxZoom: 2, reducedMotion: !!reducedMotion });
  const [jarvisWorkspaceOpen, setJarvisWorkspaceOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const [jarvisOrigin, setJarvisOrigin] = useState<LauncherOrigin | null>(null);
  // Opens Jarvis from wherever the launcher currently is (it shifts left
  // while the task rail is open), for both the button and the "J" key.
  const openJarvis = useCallback(() => {
    const rect = launcherRef.current?.getBoundingClientRect();
    setJarvisOrigin(rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null);
    setJarvisWorkspaceOpen(true);
  }, []);
  // Phones default to the bubble canvas (tap-friendly, no dragging needed),
  // with a toggle to the thread-grouped list. Ignored on wider screens,
  // which always show the canvas.
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState<"list" | "canvas">("canvas");
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

  const taskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const task of tasks) counts[task.primaryThreadId] = (counts[task.primaryThreadId] ?? 0) + 1;
    return counts;
  }, [tasks]);

  const effectiveThreadPositions = useMemo<PositionMap>(() => {
    const result: PositionMap = {};
    threads.forEach((thread, index) => {
      result[thread.id] = draggedPositions[thread.id] ?? threadPositions[thread.id] ?? defaultThreadPosition(index);
    });
    return result;
  }, [threads, threadPositions, draggedPositions]);

  const tasksByThread = useMemo(() => {
    const map = new Map<string, TaskSummary[]>();
    for (const task of tasks) {
      const list = map.get(task.primaryThreadId) ?? [];
      list.push(withOverride(task));
      map.set(task.primaryThreadId, list);
    }
    return map;
  }, [tasks, withOverride]);

  const layouts = useMemo(() => {
    const map = new Map<string, ClusterLayout>();
    for (const thread of threads) {
      map.set(
        thread.id,
        clusterLayout(tasksByThread.get(thread.id) ?? [], { includeAddSlot: thread.role !== "VIEWER" })
      );
    }
    return map;
  }, [threads, tasksByThread]);

  // Glides the camera to frame a thread's open cluster (pans only if it
  // already fits at a readable zoom).
  const focusCluster = useCallback(
    (threadId: string) => {
      const position = effectiveThreadPositions[threadId];
      const layout = layouts.get(threadId);
      if (!position || !layout) return;
      const { width, height } = store.getState();
      const zoom = cameraZoomForCluster(getZoom(), { width, height }, layout.radius, isMobile ? 12 : 48);
      void setCenter(position.x, position.y, { zoom, duration: reducedMotion ? 0 : 500 });
    },
    [effectiveThreadPositions, layouts, store, getZoom, setCenter, isMobile, reducedMotion]
  );

  const handleToggleThread = useCallback(
    (threadId: string) => {
      if (Date.now() - lastDragEndRef.current < 200) return;
      if (openThreads.isOpen(threadId)) {
        openThreads.close(threadId);
        return;
      }
      openThreads.open(threadId);
      focusCluster(threadId);
      void handleThreadBubbleClick(threadId);
    },
    [openThreads, focusCluster, handleThreadBubbleClick]
  );

  const handleCreateTask = useCallback(
    async (threadId: string, input: { title: string; description?: string; dueDate?: Date }) => {
      // Open the thread so the new task is visible as it pops into the cluster.
      openThreads.open(threadId);
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
    [router, openThreads]
  );

  const nodes = useMemo<Node[]>(() => {
    const hoveredOpen = hoveredThreadId && openThreads.isOpen(hoveredThreadId) ? hoveredThreadId : null;
    const hoveredCircle = hoveredOpen
      ? { ...effectiveThreadPositions[hoveredOpen], r: (layouts.get(hoveredOpen)?.radius ?? 0) + 16 }
      : null;
    return threads.map((thread) => {
      const open = openThreads.isOpen(thread.id);
      const position = effectiveThreadPositions[thread.id];
      const dimmed =
        !open && hoveredCircle !== null && clustersOverlap(hoveredCircle, { ...position, r: COLLAPSED_DIAMETER / 2 });
      const data: ThreadClusterData = {
        thread: { id: thread.id, name: thread.name, categoryColor: thread.categoryColor },
        tasks: tasksByThread.get(thread.id) ?? [],
        layout: layouts.get(thread.id)!,
        open,
        dimmed,
        // lib/permissions.ts: canManageThreadMeta is OWNER+EDITOR,
        // canCloseOrDeleteThread is OWNER only, canManageTasks OWNER+EDITOR.
        canEditMeta: thread.role === "OWNER" || thread.role === "EDITOR",
        canCloseOrDelete: thread.role === "OWNER",
        canEditTasks: thread.role !== "VIEWER",
        onToggle: () => handleToggleThread(thread.id),
        onHoverChange: (hovered) =>
          setHoveredThreadId((current) => (hovered ? thread.id : current === thread.id ? null : current)),
        onOpenTask: (taskId) => void openTask(taskId),
        onRenameTask: (taskId) => void openTask(taskId),
        onMoveTask: (taskId) => void handleMoveToThread(taskId),
        onLinkTask: (taskId) => void handleLinkSecondaryThread(taskId),
        onDeleteTask: (taskId) => void handleDeleteTask(taskId),
        onRename: () => void handleRenameThread(thread.id),
        onChangeColor: () => void handleChangeThreadColor(thread.id),
        onCloseThread: () => void handleCloseThread(thread.id),
        onDeleteThread: () => void handleDeleteThread(thread.id),
        onViewCatchUp: () => void handleViewStoredCatchUp(thread.id),
        onCreateTask: (input) => void handleCreateTask(thread.id, input),
      };
      return {
        id: thread.id,
        type: "threadCluster",
        position,
        zIndex: open ? (hoveredThreadId === thread.id ? 20 : 10) : 0,
        data,
      };
    });
  }, [
    threads,
    tasksByThread,
    layouts,
    effectiveThreadPositions,
    openThreads,
    hoveredThreadId,
    handleToggleThread,
    openTask,
    handleMoveToThread,
    handleLinkSecondaryThread,
    handleDeleteTask,
    handleRenameThread,
    handleChangeThreadColor,
    handleCloseThread,
    handleDeleteThread,
    handleViewStoredCatchUp,
    handleCreateTask,
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
  // (threads/tasks/positions/open threads/hover) rather than on `nodes`
  // itself: `nodes` is a useMemo whose inputs include callbacks closing
  // over `router`, and `useRouter()` isn't guaranteed to return the same
  // object across renders (this project's own test mock returns a fresh
  // object every call) -- depending on `nodes`'s identity directly made
  // this effect re-fire on every render, which set state every render,
  // which triggered another render: an infinite loop that OOM'd the
  // process. The values below only change when something real changed.
  const [localNodes, setLocalNodes] = useState<Node[]>(nodes);
  useEffect(() => {
    setLocalNodes((current) => mergeNodes(current, nodes));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, tasks, effectiveThreadPositions, taskEditOverrides, openThreads.openIds, hoveredThreadId, layouts]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setLocalNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const handleNodeDragStop = useCallback((_: unknown, node: Node) => {
    lastDragEndRef.current = Date.now();
    setDraggedPositions((prev) => ({ ...prev, [node.id]: node.position }));
    // Best effort, like task positions were: a failed save just means the
    // thread returns to its last saved spot on the next load.
    void saveThreadPosition(node.id, node.position.x, node.position.y).catch(() => {});
  }, []);

  const handleCreateThread = useCallback(
    async (input: { name: string; categoryColor: string }) => {
      await createThread(input);
      router.refresh();
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

  // Clicking a thread in the threads panel opens its cluster and glides
  // the camera to it (after a frame, in case the canvas just mounted from
  // the phone list view).
  const handleFocusThread = useCallback(
    (threadId: string) => {
      setMobileView("canvas");
      openThreads.open(threadId);
      window.setTimeout(() => focusCluster(threadId), 60);
    },
    [openThreads, focusCluster]
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
      openJarvis();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openJarvis]);

  // Esc closes the most recently opened cluster — same guards as "J", and
  // not while Jarvis (which has its own Esc handling) is open.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || jarvisWorkspaceOpen) return;
      // The target can be the document itself (no .closest) when nothing
      // is focused.
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      openThreads.closeMostRecent();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [jarvisWorkspaceOpen, openThreads]);

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
      <motion.div
        layout
        transition={{ duration: reducedMotion ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
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
            ref={flowRef}
            nodes={localNodes}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onNodeDragStop={handleNodeDragStop}
            // Node positions are thread centres, so a cluster grows evenly
            // around its thread when it opens.
            nodeOrigin={[0.5, 0.5]}
            minZoom={0.2}
            maxZoom={2}
            // Wheel/pinch zoom is handled by useSmoothWheelZoom instead.
            zoomOnScroll={false}
            zoomOnPinch={false}
            fitView
            fitViewOptions={{ padding: 0.3, maxZoom: 1.1 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
            {/* Custom buttons so zoom steps animate instead of jumping. */}
            <Controls position="bottom-left" showZoom={false} showFitView={false} showInteractive={false}>
              <ControlButton
                aria-label="Zoom In"
                title="Zoom in"
                onClick={() => void zoomIn({ duration: reducedMotion ? 0 : 300 })}
              >
                <Plus />
              </ControlButton>
              <ControlButton
                aria-label="Zoom Out"
                title="Zoom out"
                onClick={() => void zoomOut({ duration: reducedMotion ? 0 : 300 })}
              >
                <Minus />
              </ControlButton>
              <ControlButton
                aria-label="Fit View"
                title="Fit view"
                onClick={() => void fitView({ padding: 0.3, maxZoom: 1.1, duration: reducedMotion ? 0 : 300 })}
              >
                <Maximize />
              </ControlButton>
            </Controls>
          </ReactFlow>
        )}
      </motion.div>

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

      <LayoutGroup>
        {!jarvisWorkspaceOpen && (
          // Slides left of the task-detail rail while it's open, so it no
          // longer sits on top of the rail's "Post update" button.
          <JarvisPanel
            buttonRef={launcherRef}
            onOpen={openJarvis}
            shifted={selectedTask !== null && !isMobile}
          />
        )}
        <AnimatePresence>
          {jarvisWorkspaceOpen && (
            <JarvisLauncherTransition key="jarvis" origin={jarvisOrigin}>
              <JarvisWorkspace
                initialSessions={initialJarvisSessions}
                onClose={() => setJarvisWorkspaceOpen(false)}
              />
            </JarvisLauncherTransition>
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  );
}

export default function Canvas(props: {
  threads: ThreadSummary[];
  tasks: TaskSummary[];
  // Per-user saved thread-bubble centres; threads without one fall back to
  // a default grid (threadLayout.ts).
  threadPositions: PositionMap;
  // Scopes the remembered open/closed thread state in localStorage.
  userId: string;
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
