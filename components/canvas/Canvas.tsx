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
import { saveTaskPosition } from "@/app/actions/taskPositions";
import { createThread } from "@/app/actions/threads";
import { createTask, updateTask, deleteTask, moveTaskToThread, linkSecondaryThread } from "@/app/actions/tasks";
import { shareThread } from "@/app/actions/threadShares";
import { addTaskUpdate, listTaskUpdates } from "@/app/actions/taskUpdates";

const nodeTypes = { task: TaskNode, threadBubble: ThreadBubbleNode };

type ThreadSummary = { id: string; name: string; categoryColor: string; role: "OWNER" | "EDITOR" | "VIEWER" };
type TaskSummary = {
  id: string;
  primaryThreadId: string;
  title: string;
  description: string;
  workStatus: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: Date | null;
  updateCount: number;
};
type PositionMap = Record<string, { x: number; y: number }>;

function CanvasInner({
  threads,
  tasks,
  positions,
}: {
  threads: ThreadSummary[];
  tasks: TaskSummary[];
  positions: PositionMap;
}) {
  const { getZoom } = useReactFlow();
  const router = useRouter();
  const [tier, setTier] = useState<"BUBBLE" | "CARD">("CARD");
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
          data: { name: thread.name, categoryColor: thread.categoryColor },
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
          updateCount: effective.updateCount,
          onRename: () => openTask(task.id),
          onMoveToThread: () => handleMoveToThread(task.id),
          onLinkSecondaryThread: () => handleLinkSecondaryThread(task.id),
          onDelete: () => handleDeleteTask(task.id),
        },
      };
    });
  }, [tier, threads, tasks, positions, withOverride, openTask, handleMoveToThread, handleLinkSecondaryThread, handleDeleteTask]);

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
      if (node.type !== "task") return;
      await openTask(node.id);
    },
    [openTask]
  );

  const handleCreateThread = useCallback(
    async (input: { name: string; categoryColor: string }) => {
      await createThread(input);
      router.refresh();
    },
    [router]
  );

  const handleCreateTask = useCallback(
    async (threadId: string, input: { title: string }) => {
      await createTask({ primaryThreadId: threadId, title: input.title });
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
            <ShareThreadDialog
              threadId={thread.id}
              onShare={(email, permission) => handleShareThread(thread.id, email, permission)}
            />
          </div>
        ))}
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
              const taskId = selectedTask.id;
              setTaskEditOverrides((prev) => ({
                ...prev,
                [taskId]: { ...prev[taskId], ...patch },
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
    </div>
  );
}

export default function Canvas(props: {
  threads: ThreadSummary[];
  tasks: TaskSummary[];
  positions: PositionMap;
}) {
  return (
    <div style={{ width: "100%", height: "100vh", background: "var(--bg)" }}>
      <ReactFlowProvider>
        <CanvasInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
