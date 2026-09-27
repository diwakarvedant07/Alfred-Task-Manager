import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import Canvas from "@/components/canvas/Canvas";
import { createTask, updateTask } from "@/app/actions/tasks";
import { listTaskUpdates } from "@/app/actions/taskUpdates";
import { renameThread, changeThreadCategoryColor, closeThread, deleteThread } from "@/app/actions/threads";
import { listThreadShares, revokeThreadShare } from "@/app/actions/threadShares";
import { openThreadAndMaybeGetCatchUp, getStoredThreadSummary } from "@/app/actions/threadCatchUp";
import { suggestTaskPriority } from "@/app/actions/taskPriority";

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

vi.mock("@/app/actions/threadPositions", () => ({ saveThreadPosition: vi.fn(async () => undefined) }));
vi.mock("@/app/actions/threads", () => ({
  createThread: vi.fn(),
  renameThread: vi.fn(),
  changeThreadCategoryColor: vi.fn(),
  closeThread: vi.fn(),
  deleteThread: vi.fn(),
}));
vi.mock("@/app/actions/threadShares", () => ({
  shareThread: vi.fn(),
  listThreadShares: vi.fn(async () => []),
  revokeThreadShare: vi.fn(),
}));
vi.mock("@/app/actions/tasks", () => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
}));
vi.mock("@/app/actions/taskPriority", () => ({ suggestTaskPriority: vi.fn() }));
vi.mock("@/app/actions/taskUpdates", () => ({
  addTaskUpdate: vi.fn(),
  listTaskUpdates: vi.fn(async () => []),
}));
vi.mock("@/app/actions/threadCatchUp", () => ({
  openThreadAndMaybeGetCatchUp: vi.fn(),
  getStoredThreadSummary: vi.fn(),
}));
vi.mock("@/app/actions/jarvis", () => ({ sendJarvisMessage: vi.fn() }));
// Canvas renders JarvisWorkspace (Task 10), which imports these Server
// Actions. Real jarvisSessions.ts imports lib/auth (next-auth) which fails
// to resolve "next/server" in this jsdom test environment (see
// JarvisWorkspace.test.tsx, which mocks the same module for the same
// reason) -- mock it so importing Canvas doesn't pull in that chain.
vi.mock("@/app/actions/jarvisSessions", () => ({
  createJarvisSession: vi.fn(),
  listJarvisSessions: vi.fn(async () => []),
  renameJarvisSession: vi.fn(),
  deleteJarvisSession: vi.fn(),
  listJarvisMessages: vi.fn(async () => []),
}));

const task = {
  id: "t1",
  primaryThreadId: "th1",
  title: "Original title",
  description: "",
  workStatus: "TODO" as const,
  priority: "MEDIUM" as const,
  priorityIsAiSuggested: false,
  dueDate: null,
  updateCount: 0,
};

const ownerThread = { id: "th1", name: "Q3 Report", categoryColor: "#f2c14e", role: "OWNER" as const };
const editorThread = { id: "th1", name: "Q3 Report", categoryColor: "#f2c14e", role: "EDITOR" as const };

const defaultThemeProps = { initialJarvisSessions: [], threadPositions: {}, userId: "u1" };

// React Flow keeps nodes at visibility:hidden until it measures them,
// which never happens in jsdom, and accessible-name computation treats
// that subtree as nameless — so bubbles inside a node are found by their
// aria-label rather than by role + name.
const openThreadBubble = (name = "Q3 Report") =>
  fireEvent.click(screen.getByLabelText(new RegExp(`^${name} — .*Open thread$`)));

beforeEach(() => {
  vi.mocked(listTaskUpdates).mockReset().mockResolvedValue([]);
  vi.mocked(updateTask).mockReset();
  vi.mocked(createTask).mockReset();
  vi.mocked(suggestTaskPriority).mockReset();
  vi.mocked(renameThread).mockReset().mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof renameThread>>);
  vi.mocked(changeThreadCategoryColor)
    .mockReset()
    .mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof changeThreadCategoryColor>>);
  vi.mocked(closeThread).mockReset().mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof closeThread>>);
  vi.mocked(deleteThread).mockReset().mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof deleteThread>>);
  vi.mocked(listThreadShares).mockReset().mockResolvedValue([]);
  vi.mocked(revokeThreadShare).mockReset().mockResolvedValue(undefined);
  vi.mocked(openThreadAndMaybeGetCatchUp).mockReset().mockResolvedValue({ showCatchUp: false, summary: null });
  window.localStorage.clear();
  vi.mocked(getStoredThreadSummary).mockReset();
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

    render(<Canvas threads={[ownerThread]} tasks={[task]} {...defaultThemeProps} />);
    openThreadBubble();

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

    render(<Canvas threads={[ownerThread]} tasks={[task]} {...defaultThemeProps} />);
    openThreadBubble();

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

describe("Canvas — thread bubble menu", () => {
  it("renames a thread via the bubble's card menu, calling the real renameThread Server Action", async () => {
    const originalPrompt = window.prompt;
    window.prompt = vi.fn(() => "Renamed thread");

    render(
      <Canvas
        threads={[ownerThread]}
        tasks={[]}
       
        {...defaultThemeProps}
      />
    );

    fireEvent.click(within(screen.getByTestId("card-menu-trigger-area")).getByRole("button", { hidden: true }));
    fireEvent.click(screen.getByText("Rename thread"));

    await waitFor(() => expect(renameThread).toHaveBeenCalledWith("th1", "Renamed thread"));

    window.prompt = originalPrompt;
  });

  it("deletes a thread via the bubble's card menu after confirmation, calling the real deleteThread Server Action", async () => {
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);

    render(
      <Canvas
        threads={[ownerThread]}
        tasks={[]}
       
        {...defaultThemeProps}
      />
    );

    fireEvent.click(within(screen.getByTestId("card-menu-trigger-area")).getByRole("button", { hidden: true }));
    fireEvent.click(screen.getByText("Delete thread"));

    await waitFor(() => expect(deleteThread).toHaveBeenCalledWith("th1"));

    window.confirm = originalConfirm;
  });

  it("does not call closeThread/deleteThread when the confirmation is declined", async () => {
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => false);

    render(
      <Canvas
        threads={[ownerThread]}
        tasks={[]}
       
        {...defaultThemeProps}
      />
    );

    fireEvent.click(within(screen.getByTestId("card-menu-trigger-area")).getByRole("button", { hidden: true }));
    fireEvent.click(screen.getByText("Delete thread"));

    await new Promise((r) => setTimeout(r, 0));
    expect(deleteThread).not.toHaveBeenCalled();

    window.confirm = originalConfirm;
  });

  it("hides Close/Delete for a thread the caller only has EDITOR access to, matching the server's canCloseOrDeleteThread rule", () => {
    render(
      <Canvas
        threads={[editorThread]}
        tasks={[]}
       
        {...defaultThemeProps}
      />
    );

    fireEvent.click(within(screen.getByTestId("card-menu-trigger-area")).getByRole("button", { hidden: true }));
    expect(screen.getByText("Rename thread")).toBeInTheDocument();
    expect(screen.queryByText("Close thread")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete thread")).not.toBeInTheDocument();
  });
});

describe("Canvas — thread sharing management (Finding 2)", () => {
  it("only shows the Share control to a thread's OWNER, not an EDITOR", () => {
    const { rerender } = render(
      <Canvas threads={[ownerThread]} tasks={[]} {...defaultThemeProps} />
    );
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();

    rerender(<Canvas threads={[editorThread]} tasks={[]} {...defaultThemeProps} />);
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
  });

  it("loads and can revoke a thread's shares through the real Server Actions", async () => {
    vi.mocked(listThreadShares).mockResolvedValue([
      { id: "share1", permission: "VIEWER", sharedWithUser: { name: "Vera", email: "vera@example.com" } },
    ] as unknown as Awaited<ReturnType<typeof listThreadShares>>);

    render(<Canvas threads={[ownerThread]} tasks={[]} {...defaultThemeProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(listThreadShares).toHaveBeenCalledWith("th1"));

    const revokeButton = await screen.findByRole("button", { name: "Revoke" });
    fireEvent.click(revokeButton);

    await waitFor(() => expect(revokeThreadShare).toHaveBeenCalledWith("share1"));
  });
});

describe("Canvas — thread catch-up (Task 11 wiring)", () => {
  it("clicking a thread bubble opens the catch-up modal when the server says to show one", async () => {
    vi.mocked(openThreadAndMaybeGetCatchUp).mockResolvedValue({
      showCatchUp: true,
      summary: "Welcome back.",
    });

    render(
      <Canvas
        threads={[ownerThread]}
        tasks={[]}
       
        {...defaultThemeProps}
      />
    );

    // The thread's name also appears as plain text in the settings strip
    // (see the NewTaskButton row above the canvas), so target the actual
    // React Flow node — identified by its stable rf__node-<id> testid —
    // rather than ambiguous text.
    openThreadBubble();

    expect(await screen.findByText("Welcome back.")).toBeInTheDocument();
    expect(openThreadAndMaybeGetCatchUp).toHaveBeenCalledWith("th1");
  });

  it("clicking a thread bubble does not open the modal when the server says there's nothing new", async () => {
    vi.mocked(openThreadAndMaybeGetCatchUp).mockResolvedValue({
      showCatchUp: false,
      summary: null,
    });

    render(
      <Canvas
        threads={[ownerThread]}
        tasks={[]}
       
        {...defaultThemeProps}
      />
    );

    openThreadBubble();

    await waitFor(() => expect(openThreadAndMaybeGetCatchUp).toHaveBeenCalledWith("th1"));
    expect(screen.queryByRole("dialog", { name: "Catch-up" })).not.toBeInTheDocument();
  });

  it("the thread bubble's 'View catch-up' menu item shows the stored summary read-only, without re-triggering the click flow", async () => {
    vi.mocked(getStoredThreadSummary).mockResolvedValue("Last time: shipped the report.");

    render(
      <Canvas
        threads={[ownerThread]}
        tasks={[]}
       
        {...defaultThemeProps}
      />
    );

    fireEvent.click(within(screen.getByTestId("card-menu-trigger-area")).getByRole("button", { hidden: true }));
    fireEvent.click(screen.getByText("View catch-up"));

    expect(await screen.findByText("Last time: shipped the report.")).toBeInTheDocument();
    expect(getStoredThreadSummary).toHaveBeenCalledWith("th1");
    expect(openThreadAndMaybeGetCatchUp).not.toHaveBeenCalled();
  });

  // Finding 6 regression tests: neither handler had a try/catch, so a
  // rejected Server Action call left the "Catching you up…" loading state
  // showing forever (plus an unhandled promise rejection in the console).
  it("shows an error message instead of hanging when openThreadAndMaybeGetCatchUp rejects", async () => {
    vi.mocked(openThreadAndMaybeGetCatchUp).mockRejectedValue(new Error("network error"));

    render(
      <Canvas
        threads={[ownerThread]}
        tasks={[]}
       
        {...defaultThemeProps}
      />
    );

    openThreadBubble();

    await screen.findByRole("dialog", { name: "Catch-up" });
    expect(screen.queryByText("Catching you up…")).not.toBeInTheDocument();
    expect(
      screen.getByText("Something went wrong loading your catch-up. Please try again.")
    ).toBeInTheDocument();
  });

  it("shows an error message instead of hanging when getStoredThreadSummary rejects", async () => {
    vi.mocked(getStoredThreadSummary).mockRejectedValue(new Error("network error"));

    render(
      <Canvas
        threads={[ownerThread]}
        tasks={[]}
       
        {...defaultThemeProps}
      />
    );

    fireEvent.click(within(screen.getByTestId("card-menu-trigger-area")).getByRole("button", { hidden: true }));
    fireEvent.click(screen.getByText("View catch-up"));

    await screen.findByRole("dialog", { name: "Catch-up" });
    expect(screen.queryByText("Catching you up…")).not.toBeInTheDocument();
    expect(
      screen.getByText("Something went wrong loading your catch-up. Please try again.")
    ).toBeInTheDocument();
  });
});

describe("Canvas — AI priority suggestion on task creation (Task 9 wiring)", () => {
  it("fires suggestTaskPriority after creating a task and applies the result once it resolves", async () => {
    vi.mocked(createTask).mockResolvedValue({
      id: "new-task-id",
    } as unknown as Awaited<ReturnType<typeof createTask>>);
    vi.mocked(suggestTaskPriority).mockResolvedValue({
      id: "new-task-id",
      priority: "HIGH",
      priorityIsAiSuggested: true,
    } as unknown as Awaited<ReturnType<typeof suggestTaskPriority>>);

    render(<Canvas threads={[ownerThread]} tasks={[]} {...defaultThemeProps} />);

    fireEvent.click(screen.getByRole("button", { name: "New task" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New task" } });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(createTask).toHaveBeenCalledWith({ primaryThreadId: "th1", title: "New task" }));
    await waitFor(() => expect(suggestTaskPriority).toHaveBeenCalledWith("new-task-id"));
  });

  it("does not surface an error when suggestTaskPriority rejects", async () => {
    vi.mocked(createTask).mockResolvedValue({
      id: "new-task-id",
    } as unknown as Awaited<ReturnType<typeof createTask>>);
    vi.mocked(suggestTaskPriority).mockRejectedValue(new Error("model unavailable"));

    render(<Canvas threads={[ownerThread]} tasks={[]} {...defaultThemeProps} />);

    fireEvent.click(screen.getByRole("button", { name: "New task" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New task" } });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(suggestTaskPriority).toHaveBeenCalledWith("new-task-id"));

    // Swallowed silently — no unhandled rejection, no crash, dialog just closes.
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New task in th1" })).not.toBeInTheDocument());
  });
});

describe("Canvas — bubble clusters", () => {
  it("opens a thread into its task bubbles and closes it again with the ×", async () => {
    render(<Canvas threads={[ownerThread]} tasks={[task]} {...defaultThemeProps} />);
    expect(screen.queryByLabelText(/^Original title/)).not.toBeInTheDocument();

    openThreadBubble();
    expect(await screen.findByLabelText("Original title, medium priority")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close Q3 Report"));
    await waitFor(() =>
      expect(screen.queryByLabelText(/^Original title/)).not.toBeInTheDocument()
    );
  });

  it("closes the most recently opened thread on Escape", async () => {
    render(<Canvas threads={[ownerThread]} tasks={[task]} {...defaultThemeProps} />);
    openThreadBubble();
    await screen.findByLabelText("Close Q3 Report");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("Close Q3 Report")).not.toBeInTheDocument());
  });

  it("restores open threads from localStorage for the same user", async () => {
    window.localStorage.setItem("arc.openThreads.u1", JSON.stringify(["th1"]));
    render(<Canvas threads={[ownerThread]} tasks={[task]} {...defaultThemeProps} />);
    expect(await screen.findByLabelText("Close Q3 Report")).toBeInTheDocument();
  });

  it("opens the thread when a task is created in it from the threads panel", async () => {
    vi.mocked(createTask).mockResolvedValue({ id: "new-task-id" } as unknown as Awaited<ReturnType<typeof createTask>>);
    vi.mocked(suggestTaskPriority).mockResolvedValue({
      id: "new-task-id",
      priority: "MEDIUM",
      priorityIsAiSuggested: true,
    } as unknown as Awaited<ReturnType<typeof suggestTaskPriority>>);
    render(<Canvas threads={[ownerThread]} tasks={[]} {...defaultThemeProps} />);
    fireEvent.click(screen.getByRole("button", { name: "New task" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Fresh" } });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));
    expect(await screen.findByLabelText("Close Q3 Report")).toBeInTheDocument();
  });
});

describe("Canvas — Jarvis launch", () => {
  it("opens the workspace from the launcher and restores the launcher on close", async () => {
    render(<Canvas threads={[]} tasks={[]} {...defaultThemeProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Jarvis" }));
    expect(await screen.findByTestId("jarvis-launch-transition")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Jarvis" })).not.toBeInTheDocument();
  });
});
