import { Handle, Position } from "@xyflow/react";
import CardMenu from "./CardMenu";

const WORK_STATUS_LABEL: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};

const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

const NOOP = () => {};

export default function TaskNode({
  data,
}: {
  id: string;
  data: {
    title: string;
    workStatus: string;
    priority: string;
    updateCount: number;
    onRename?: () => void;
    onMoveToThread?: () => void;
    onLinkSecondaryThread?: () => void;
    onDelete?: () => void;
  };
}) {
  return (
    <div
      className="task-card"
      style={{
        background: "var(--panel-bg)",
        borderLeft: "4px solid var(--accent)",
        borderRadius: 6,
        padding: 8,
        boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
        color: "var(--text)",
        minWidth: 150,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 12 }}>{data.title}</div>
        <CardMenu
          variant="task"
          onRename={data.onRename ?? NOOP}
          onMoveToThread={data.onMoveToThread ?? NOOP}
          onLinkSecondaryThread={data.onLinkSecondaryThread ?? NOOP}
          onDelete={data.onDelete ?? NOOP}
        />
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        <span>{WORK_STATUS_LABEL[data.workStatus]}</span>
        <span>{PRIORITY_LABEL[data.priority]}</span>
      </div>
      <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>💬 {data.updateCount}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
