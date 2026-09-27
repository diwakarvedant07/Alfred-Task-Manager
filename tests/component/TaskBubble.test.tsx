import { describe, it, expect, vi } from "vitest";
import type React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import TaskBubble from "@/components/canvas/TaskBubble";

function setup(overrides: Partial<React.ComponentProps<typeof TaskBubble>> = {}) {
  const props = {
    task: { id: "t1", title: "Ship API", priority: "HIGH" as const, workStatus: "TODO" as const },
    r: 34,
    color: "#7f77dd",
    compact: false,
    onOpen: vi.fn(),
    onRename: vi.fn(),
    onMoveToThread: vi.fn(),
    onLinkSecondaryThread: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  const utils = render(<TaskBubble {...props} />);
  return { ...utils, props };
}

describe("TaskBubble", () => {
  it("shows the title and priority marks, and opens the task on click", () => {
    const { props } = setup();
    const bubble = screen.getByRole("button", { name: "Ship API, high priority" });
    expect(bubble).toHaveTextContent("!!!");
    expect(bubble).toHaveTextContent("Ship API");
    fireEvent.click(bubble);
    expect(props.onOpen).toHaveBeenCalled();
  });

  it("marks DONE tasks as faded with a strikethrough", () => {
    setup({ task: { id: "t1", title: "Docs", priority: "LOW", workStatus: "DONE" } });
    const bubble = screen.getByRole("button", { name: "Docs, low priority, done" });
    expect(bubble.className).toContain("opacity-45");
    expect(screen.getByText("Docs").className).toContain("line-through");
  });

  it("draws a pulsing outline for IN_PROGRESS tasks", () => {
    const { container } = setup({
      task: { id: "t1", title: "Plan", priority: "MEDIUM", workStatus: "IN_PROGRESS" },
    });
    expect(container.querySelector("[data-testid='in-progress-ring']")).not.toBeNull();
  });

  it("opens the task menu on right-click without opening the task", () => {
    const { props } = setup();
    const bubble = screen.getByRole("button", { name: "Ship API, high priority" });
    fireEvent.contextMenu(bubble);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(props.onDelete).toHaveBeenCalled();
    expect(props.onOpen).not.toHaveBeenCalled();
  });
});
