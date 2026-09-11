"use client";

import { useCallback, useMemo, useState } from "react";
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
import { saveTaskPosition } from "@/app/actions/taskPositions";

const nodeTypes = { task: TaskNode, threadBubble: ThreadBubbleNode };

type ThreadSummary = { id: string; name: string; categoryColor: string };
type TaskSummary = {
  id: string;
  primaryThreadId: string;
  title: string;
  workStatus: string;
  priority: string;
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
  const [tier, setTier] = useState<"BUBBLE" | "CARD">("CARD");

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

  return (
    <ReactFlow
      nodes={nodes}
      nodeTypes={nodeTypes}
      onMoveEnd={handleMoveEnd}
      onNodeDragStop={handleNodeDragStop}
      fitView
    >
      <Background />
      <Controls />
    </ReactFlow>
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
