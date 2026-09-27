import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ThreadClusterNode, { type ThreadClusterData, clusterNodeDiameter } from "@/components/canvas/ThreadClusterNode";
import { clusterLayout } from "@/components/canvas/clusterLayout";

const tasks = [
  { id: "t1", title: "Ship API", priority: "HIGH" as const, workStatus: "TODO" as const },
  { id: "t2", title: "Write docs", priority: "LOW" as const, workStatus: "DONE" as const },
];

function makeData(overrides: Partial<ThreadClusterData> = {}): ThreadClusterData {
  const canEditTasks = overrides.canEditTasks ?? true;
  return {
    thread: { id: "th1", name: "Launch", categoryColor: "#7f77dd" },
    tasks,
    layout: clusterLayout(tasks, { includeAddSlot: canEditTasks }),
    open: false,
    dimmed: false,
    canEditMeta: true,
    canCloseOrDelete: true,
    canEditTasks,
    onToggle: vi.fn(),
    onHoverChange: vi.fn(),
    onOpenTask: vi.fn(),
    onRenameTask: vi.fn(),
    onMoveTask: vi.fn(),
    onLinkTask: vi.fn(),
    onDeleteTask: vi.fn(),
    onRename: vi.fn(),
    onChangeColor: vi.fn(),
    onCloseThread: vi.fn(),
    onDeleteThread: vi.fn(),
    onViewCatchUp: vi.fn(),
    onCreateTask: vi.fn(),
    ...overrides,
  };
}

describe("ThreadClusterNode", () => {
  it("collapsed: shows the dashboard button and no task bubbles or ×", () => {
    const data = makeData();
    render(<ThreadClusterNode id="th1" data={data} />);
    const bubble = screen.getByRole("button", { name: "Launch — 1 high, 0 medium, 0 low open, 1 done. Open thread" });
    expect(screen.queryByRole("button", { name: "Close Launch" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Ship API/ })).not.toBeInTheDocument();
    fireEvent.click(bubble);
    expect(data.onToggle).toHaveBeenCalled();
  });

  it("open: shows the ×, every task bubble and the add slot; × toggles closed", () => {
    const data = makeData({ open: true });
    render(<ThreadClusterNode id="th1" data={data} />);
    expect(screen.queryByRole("button", { name: /Open thread$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ship API, high priority" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write docs, low priority, done" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add task to Launch" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close Launch" }));
    expect(data.onToggle).toHaveBeenCalled();
  });

  it("clicking a task bubble opens that task", () => {
    const data = makeData({ open: true });
    render(<ThreadClusterNode id="th1" data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Ship API, high priority" }));
    expect(data.onOpenTask).toHaveBeenCalledWith("t1");
  });

  it("removes task bubbles after closing", async () => {
    const data = makeData({ open: true });
    const { rerender } = render(<ThreadClusterNode id="th1" data={data} />);
    rerender(<ThreadClusterNode id="th1" data={{ ...data, open: false }} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Ship API/ })).not.toBeInTheDocument());
  });

  it("hides the add slot when the user can't edit tasks", () => {
    render(<ThreadClusterNode id="th1" data={makeData({ open: true, canEditTasks: false })} />);
    expect(screen.queryByRole("button", { name: "Add task to Launch" })).not.toBeInTheDocument();
  });

  it("collapsed ⋮ menu is gated by permissions", () => {
    render(<ThreadClusterNode id="th1" data={makeData({ canCloseOrDelete: false })} />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menuitem", { name: "Rename thread" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete thread" })).not.toBeInTheDocument();
  });

  it("right-clicking the × opens the thread menu", () => {
    const data = makeData({ open: true });
    render(<ThreadClusterNode id="th1" data={data} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "Close Launch" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "View catch-up" }));
    expect(data.onViewCatchUp).toHaveBeenCalled();
    expect(data.onToggle).not.toHaveBeenCalled();
  });

  it("sizes the node to the collapsed bubble, or the open cluster plus margin", () => {
    const layout = clusterLayout(tasks, { includeAddSlot: true });
    expect(clusterNodeDiameter(false, layout)).toBe(150);
    expect(clusterNodeDiameter(true, layout)).toBe(Math.max(150, 2 * (layout.radius + 16)));
  });
});
