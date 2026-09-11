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
import { createTask, updateTask } from "@/app/actions/tasks";
import { shareThread } from "@/app/actions/threadShares";
import { addTaskUpdate, listTaskUpdates } from "@/app/actions/taskUpdates";

const nodeTypes = { task: TaskNode, threadBubble: ThreadBubbleNode };

type ThreadSummary = { id: string; name: string; categoryColor: string };
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
  // Local, synchronous overrides for the currently-open task's in-progress
  // edits. Server round-trips (updateTask calls) fire per keystroke and can
  // resolve out of order, so what's displayed must never depend on their
  // timing — only on the order these edits were made.
  const [taskEditOverride, setTaskEditOverride] = useState<Partial<TaskSummary> | null>(null);

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
    return tasks.map((task) => ({
      id: task.id,
      type: "task",
      position: positions[task.id] ?? { x: 0, y: 0 },
      data: {
        title: task.title,
        workStatus: task.workStatus,
        priority: task.priority,
        updateCount: task.updateCount,
      },
    }));
  }, [tier, threads, tasks, positions]);

  const handleMoveEnd = useCallback(() => {
    setTier(getZoomTier(getZoom()));
  }, [getZoom]);

  const handleNodeDragStop = useCallback((_: unknown, node: Node) => {
    if (node.type === "task") {
      void saveTaskPosition(node.id, node.position.x, node.position.y);
    }
  }, []);

  const handleNodeClick = useCallback(async (_: unknown, node: Node) => {
    if (node.type !== "task") return;
    setSelectedTaskId(node.id);
    setTaskEditOverride(null);
    setSelectedTaskUpdates(await listTaskUpdates(node.id));
  }, []);

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
  const selectedTask = baseSelectedTask
    ? { ...baseSelectedTask, ...taskEditOverride }
    : null;

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
            onUpdateTask={async (patch) => {
              // Apply synchronously so the displayed value always reflects
              // the most recently typed edit, regardless of how long the
              // Server Action call below takes or the order responses land in.
              setTaskEditOverride((prev) => ({ ...prev, ...patch }));
              await updateTask(selectedTask.id, patch);
            }}
            onAddComment={async (body) => {
              await addTaskUpdate(selectedTask.id, body);
              setSelectedTaskUpdates(await listTaskUpdates(selectedTask.id));
            }}
            onClose={() => {
              setSelectedTaskId(null);
              setTaskEditOverride(null);
            }}
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
