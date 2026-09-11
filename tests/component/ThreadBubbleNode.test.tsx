import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import ThreadBubbleNode from "@/components/canvas/ThreadBubbleNode";

describe("ThreadBubbleNode", () => {
  it("shows the thread name in its category color", () => {
    render(
      <ReactFlowProvider>
        <ThreadBubbleNode id="th1" data={{ name: "Q3 Report", categoryColor: "#f2c14e" }} />
      </ReactFlowProvider>
    );

    const bubble = screen.getByText("Q3 Report");
    expect(bubble).toBeInTheDocument();
  });
});
