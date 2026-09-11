import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

  it("renders a card menu that invokes the rename/color/close/delete handlers", () => {
    const onRename = vi.fn();
    const onChangeColor = vi.fn();
    const onClose = vi.fn();
    const onDelete = vi.fn();

    render(
      <ReactFlowProvider>
        <ThreadBubbleNode
          id="th1"
          data={{
            name: "Q3 Report",
            categoryColor: "#f2c14e",
            onRename,
            onChangeColor,
            onClose,
            onDelete,
          }}
        />
      </ReactFlowProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByText("Rename thread"));
    expect(onRename).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByText("Change category color"));
    expect(onChangeColor).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByText("Close thread"));
    expect(onClose).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByText("Delete thread"));
    expect(onDelete).toHaveBeenCalled();
  });

  it("hides Rename/Change color when canEditMeta is false, and Close/Delete when canCloseOrDelete is false", () => {
    render(
      <ReactFlowProvider>
        <ThreadBubbleNode
          id="th1"
          data={{
            name: "Q3 Report",
            categoryColor: "#f2c14e",
            canEditMeta: false,
            canCloseOrDelete: false,
          }}
        />
      </ReactFlowProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.queryByText("Rename thread")).not.toBeInTheDocument();
    expect(screen.queryByText("Change category color")).not.toBeInTheDocument();
    expect(screen.queryByText("Close thread")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete thread")).not.toBeInTheDocument();
  });
});
