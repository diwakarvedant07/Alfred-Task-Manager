import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Canvas from "@/components/canvas/Canvas";
import { updateTask } from "@/app/actions/tasks";
import { listTaskUpdates } from "@/app/actions/taskUpdates";

// @xyflow/react measures node dimensions with ResizeObserver, which jsdom
// does not implement. A no-op stub is the standard way to render ReactFlow
// in a jsdom test environment.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/actions/taskPositions", () => ({ saveTaskPosition: vi.fn() }));
vi.mock("@/app/actions/threads", () => ({ createThread: vi.fn() }));
vi.mock("@/app/actions/threadShares", () => ({ shareThread: vi.fn() }));
vi.mock("@/app/actions/tasks", () => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
}));
vi.mock("@/app/actions/taskUpdates", () => ({
  addTaskUpdate: vi.fn(),
  listTaskUpdates: vi.fn(async () => []),
}));

const task = {
  id: "t1",
  primaryThreadId: "th1",
  title: "Original title",
  description: "",
  workStatus: "TODO" as const,
  priority: "MEDIUM" as const,
  dueDate: null,
  updateCount: 0,
};

beforeEach(() => {
  vi.mocked(listTaskUpdates).mockReset().mockResolvedValue([]);
  vi.mocked(updateTask).mockReset();
});

describe("Canvas — task edit race condition", () => {
  it("keeps the most recently typed title even when an earlier keystroke's save resolves later", async () => {
    // Two in-flight updateTask calls whose completion order is the reverse
    // of the order they were called in — the exact scenario that used to
    // cause an earlier keystroke to clobber a later one via router.refresh().
    const deferred: { resolve: (v?: unknown) => void }[] = [];
    function fakeUpdateTask() {
      return new Promise((resolve) => {
        deferred.push({ resolve });
      });
    }
    vi.mocked(updateTask).mockImplementation(fakeUpdateTask as unknown as typeof updateTask);

    render(<Canvas threads={[]} tasks={[task]} positions={{}} />);

    fireEvent.click(screen.getByText("Original title"));

    const titleInput = await screen.findByLabelText("Title");
    expect(titleInput).toHaveValue("Original title");

    // First keystroke: types "First edit"
    fireEvent.change(titleInput, { target: { value: "First edit" } });
    // Second keystroke: types "First edit 2" (the latest state of the field)
    fireEvent.change(titleInput, { target: { value: "First edit 2" } });

    await waitFor(() => expect(deferred).toHaveLength(2));

    // Resolve out of order: the *second* call's Server Action response lands
    // first, then the first call's response lands after it.
    deferred[1].resolve(undefined);
    deferred[0].resolve(undefined);

    // Give any (incorrect) post-resolution re-render a chance to happen.
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByLabelText("Title")).toHaveValue("First edit 2");
  });

  it("keeps an edit visible on the canvas node, and after closing and reopening the panel", async () => {
    vi.mocked(updateTask).mockResolvedValue(
      undefined as unknown as Awaited<ReturnType<typeof updateTask>>
    );

    render(<Canvas threads={[]} tasks={[task]} positions={{}} />);

    // Open the panel and edit the title.
    fireEvent.click(screen.getByText("Original title"));
    const titleInput = await screen.findByLabelText("Title");
    fireEvent.change(titleInput, { target: { value: "Edited title" } });

    await waitFor(() => expect(updateTask).toHaveBeenCalledWith("t1", { title: "Edited title" }));

    // (a) The canvas node itself — not just the open panel — reflects the
    // edit. It's rendered from `nodes`/TaskNode as plain text, so this
    // query only matches the node, not the panel's <input>.
    expect(screen.getByText("Edited title")).toBeInTheDocument();

    // Close the panel.
    fireEvent.click(screen.getByLabelText("Close"));
    await waitFor(() => expect(screen.queryByLabelText("Title")).not.toBeInTheDocument());

    // (b) Re-click the same (now-renamed) node to reopen the panel. It
    // must still show the edited value, not fall back to the stale
    // `tasks` prop's "Original title".
    fireEvent.click(screen.getByText("Edited title"));
    const reopenedTitleInput = await screen.findByLabelText("Title");
    expect(reopenedTitleInput).toHaveValue("Edited title");
  });
});
