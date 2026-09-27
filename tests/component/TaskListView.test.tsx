import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import TaskListView from "@/components/canvas/TaskListView";

const THREADS = [
  { id: "t1", name: "Launch", categoryColor: "#38e0ff", role: "OWNER" as const },
  { id: "t2", name: "Shared", categoryColor: "#a78bfa", role: "VIEWER" as const },
];

const TASKS = [
  { id: "a", primaryThreadId: "t1", title: "Done thing", workStatus: "DONE" as const, priority: "HIGH" as const, priorityIsAiSuggested: false, updateCount: 0 },
  { id: "b", primaryThreadId: "t1", title: "Low todo", workStatus: "TODO" as const, priority: "LOW" as const, priorityIsAiSuggested: false, updateCount: 1 },
  { id: "c", primaryThreadId: "t1", title: "Urgent todo", workStatus: "TODO" as const, priority: "HIGH" as const, priorityIsAiSuggested: true, updateCount: 2 },
  { id: "d", primaryThreadId: "t2", title: "Their task", workStatus: "IN_PROGRESS" as const, priority: "MEDIUM" as const, priorityIsAiSuggested: false, updateCount: 0 },
];

function renderList(overrides: Partial<Parameters<typeof TaskListView>[0]> = {}) {
  const props = {
    threads: THREADS,
    tasks: TASKS,
    threadShares: {},
    selectedTaskId: null,
    onOpenTask: vi.fn(),
    onCreateThread: vi.fn(),
    onCreateTask: vi.fn(),
    onShareThread: vi.fn(),
    onLoadThreadShares: vi.fn(),
    onRevokeThreadShare: vi.fn(),
    onMoveToThread: vi.fn(),
    onLinkSecondaryThread: vi.fn(),
    onDeleteTask: vi.fn(),
    onRenameThread: vi.fn(),
    onChangeThreadColor: vi.fn(),
    onCloseThread: vi.fn(),
    onDeleteThread: vi.fn(),
    onViewCatchUp: vi.fn(),
    ...overrides,
  };
  render(<TaskListView {...props} />);
  return props;
}

describe("TaskListView", () => {
  it("groups tasks by thread, unfinished and higher-priority first", () => {
    renderList();
    const launchTasks = within(screen.getByRole("list", { name: "Launch tasks" }))
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(launchTasks[0]).toContain("Urgent todo");
    expect(launchTasks[1]).toContain("Low todo");
    expect(launchTasks[2]).toContain("Done thing");
    expect(within(screen.getByRole("list", { name: "Shared tasks" })).getByText("Their task")).toBeInTheDocument();
  });

  it("opens a task when its row is tapped", () => {
    const props = renderList();
    fireEvent.click(screen.getByRole("button", { name: /Low todo/ }));
    expect(props.onOpenTask).toHaveBeenCalledWith("b");
  });

  it("collapses a thread's tasks from its header", () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: /^Launch/ }));
    expect(screen.queryByText("Urgent todo")).not.toBeInTheDocument();
  });

  it("hides add-task and share for a viewer's thread", () => {
    renderList();
    const shared = screen.getByRole("region", { name: "Shared" });
    expect(within(shared).queryByRole("button", { name: "New task" })).not.toBeInTheDocument();
    const launch = screen.getByRole("region", { name: "Launch" });
    expect(within(launch).getByRole("button", { name: "New task" })).toBeInTheDocument();
  });
});
