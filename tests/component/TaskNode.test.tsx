import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import TaskNode from "@/components/canvas/TaskNode";

describe("TaskNode", () => {
  it("shows title, work status, priority, and update count", () => {
    render(
      <ReactFlowProvider>
        <TaskNode
          id="t1"
          data={{ title: "Draft exec summary", workStatus: "IN_PROGRESS", priority: "HIGH", updateCount: 3 }}
        />
      </ReactFlowProvider>
    );

    expect(screen.getByText("Draft exec summary")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("💬 3")).toBeInTheDocument();
  });
});
