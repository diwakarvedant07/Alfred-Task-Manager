import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Canvas from "@/components/canvas/Canvas";
import { updateTask } from "@/app/actions/tasks";
import { listTaskUpdates } from "@/app/actions/taskUpdates";
import { renameThread, changeThreadCategoryColor, closeThread, deleteThread } from "@/app/actions/threads";
import { listThreadShares, revokeThreadShare } from "@/app/actions/threadShares";
import { updateThemePreference } from "@/app/actions/theme";
import { openThreadAndMaybeGetCatchUp, getStoredThreadSummary } from "@/app/actions/threadCatchUp";
import { updatePreferredAiModel } from "@/app/actions/aiModel";

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
vi.mock("@/app/actions/taskUpdates", () => ({
  addTaskUpdate: vi.fn(),
  listTaskUpdates: vi.fn(async () => []),
}));
vi.mock("@/app/actions/theme", () => ({ updateThemePreference: vi.fn() }));
vi.mock("@/app/actions/threadCatchUp", () => ({
  openThreadAndMaybeGetCatchUp: vi.fn(),
  getStoredThreadSummary: vi.fn(),
}));
vi.mock("@/app/actions/aiModel", () => ({ updatePreferredAiModel: vi.fn() }));

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

const defaultThemeProps = {
  themeMode: "DARK" as const,
  accentColor: "#38e0ff",
  preferredAiModel: "gemini-2.5-pro",
};

beforeEach(() => {
  vi.mocked(listTaskUpdates).mockReset().mockResolvedValue([]);
  vi.mocked(updateTask).mockReset();
  vi.mocked(renameThread).mockReset().mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof renameThread>>);
  vi.mocked(changeThreadCategoryColor)
    .mockReset()
    .mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof changeThreadCategoryColor>>);
  vi.mocked(closeThread).mockReset().mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof closeThread>>);
  vi.mocked(deleteThread).mockReset().mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof deleteThread>>);
  vi.mocked(listThreadShares).mockReset().mockResolvedValue([]);
  vi.mocked(revokeThreadShare).mockReset().mockResolvedValue(undefined);
  vi.mocked(updateThemePreference).mockReset();
  vi.mocked(openThreadAndMaybeGetCatchUp).mockReset();
  vi.mocked(getStoredThreadSummary).mockReset();
  vi.mocked(updatePreferredAiModel).mockReset();
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

    render(<Canvas threads={[]} tasks={[task]} positions={{}} {...defaultThemeProps} />);

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

    render(<Canvas threads={[]} tasks={[task]} positions={{}} {...defaultThemeProps} />);

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

const ownerThread = { id: "th1", name: "Q3 Report", categoryColor: "#f2c14e", role: "OWNER" as const };
const editorThread = { id: "th1", name: "Q3 Report", categoryColor: "#f2c14e", role: "EDITOR" as const };

describe("Canvas — thread bubble menu (BUBBLE tier)", () => {
  it("renames a thread via the bubble's card menu, calling the real renameThread Server Action", async () => {
    const originalPrompt = window.prompt;
    window.prompt = vi.fn(() => "Renamed thread");

    render(
      <Canvas
        threads={[ownerThread]}
        tasks={[]}
        positions={{}}
        {...defaultThemeProps}
        initialTier="BUBBLE"
      />
    );

    fireEvent.click(screen.getByText("⋮"));
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
        positions={{}}
        {...defaultThemeProps}
        initialTier="BUBBLE"
      />
    );

    fireEvent.click(screen.getByText("⋮"));
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
        positions={{}}
        {...defaultThemeProps}
        initialTier="BUBBLE"
      />
    );

    fireEvent.click(screen.getByText("⋮"));
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
        positions={{}}
        {...defaultThemeProps}
        initialTier="BUBBLE"
      />
    );

    fireEvent.click(screen.getByText("⋮"));
    expect(screen.getByText("Rename thread")).toBeInTheDocument();
    expect(screen.queryByText("Close thread")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete thread")).not.toBeInTheDocument();
  });
});

describe("Canvas — theme settings (Finding 1 wiring)", () => {
  it("calls updateThemePreference with the new accent color when the color picker changes", async () => {
    render(<Canvas threads={[]} tasks={[]} positions={{}} {...defaultThemeProps} />);

    fireEvent.change(screen.getByLabelText("Accent color"), { target: { value: "#ff5fa8" } });

    await waitFor(() => expect(updateThemePreference).toHaveBeenCalledWith("DARK", "#ff5fa8"));
  });

  it("calls updateThemePreference with the toggled mode when the theme toggle is clicked", async () => {
    render(<Canvas threads={[]} tasks={[]} positions={{}} {...defaultThemeProps} />);

    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => expect(updateThemePreference).toHaveBeenCalledWith("LIGHT", "#38e0ff"));
  });

  it("applies the chosen accent color to the document root immediately, without waiting on the Server Action", () => {
    render(<Canvas threads={[]} tasks={[]} positions={{}} {...defaultThemeProps} />);

    fireEvent.change(screen.getByLabelText("Accent color"), { target: { value: "#ff5fa8" } });

    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#ff5fa8");
  });
});

describe("Canvas — thread sharing management (Finding 2)", () => {
  it("only shows the Share control to a thread's OWNER, not an EDITOR", () => {
    const { rerender } = render(
      <Canvas threads={[ownerThread]} tasks={[]} positions={{}} {...defaultThemeProps} />
    );
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();

    rerender(<Canvas threads={[editorThread]} tasks={[]} positions={{}} {...defaultThemeProps} />);
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
  });

  it("loads and can revoke a thread's shares through the real Server Actions", async () => {
    vi.mocked(listThreadShares).mockResolvedValue([
      { id: "share1", permission: "VIEWER", sharedWithUser: { name: "Vera", email: "vera@example.com" } },
    ] as unknown as Awaited<ReturnType<typeof listThreadShares>>);

    render(<Canvas threads={[ownerThread]} tasks={[]} positions={{}} {...defaultThemeProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(listThreadShares).toHaveBeenCalledWith("th1"));

    const revokeButton = await screen.findByRole("button", { name: "Revoke" });
    fireEvent.click(revokeButton);

    await waitFor(() => expect(revokeThreadShare).toHaveBeenCalledWith("share1"));
  });
});

describe("Canvas — thread catch-up and AI model picker (Task 11 wiring)", () => {
  it("clicking a thread bubble opens the catch-up modal when the server says to show one", async () => {
    vi.mocked(openThreadAndMaybeGetCatchUp).mockResolvedValue({
      showCatchUp: true,
      summary: "Welcome back.",
    });

    render(
      <Canvas
        threads={[ownerThread]}
        tasks={[]}
        positions={{}}
        {...defaultThemeProps}
        initialTier="BUBBLE"
      />
    );

    // The thread's name also appears as plain text in the settings strip
    // (see the NewTaskButton row above the canvas), so target the actual
    // React Flow node — identified by its stable rf__node-<id> testid —
    // rather than ambiguous text.
    fireEvent.click(screen.getByTestId("rf__node-th1"));

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
        positions={{}}
        {...defaultThemeProps}
        initialTier="BUBBLE"
      />
    );

    fireEvent.click(screen.getByTestId("rf__node-th1"));

    await waitFor(() => expect(openThreadAndMaybeGetCatchUp).toHaveBeenCalledWith("th1"));
    expect(screen.queryByRole("dialog", { name: "Catch-up" })).not.toBeInTheDocument();
  });

  it("the thread bubble's 'View catch-up' menu item shows the stored summary read-only, without re-triggering the click flow", async () => {
    vi.mocked(getStoredThreadSummary).mockResolvedValue("Last time: shipped the report.");

    render(
      <Canvas
        threads={[ownerThread]}
        tasks={[]}
        positions={{}}
        {...defaultThemeProps}
        initialTier="BUBBLE"
      />
    );

    fireEvent.click(screen.getByText("⋮"));
    fireEvent.click(screen.getByText("View catch-up"));

    expect(await screen.findByText("Last time: shipped the report.")).toBeInTheDocument();
    expect(getStoredThreadSummary).toHaveBeenCalledWith("th1");
    expect(openThreadAndMaybeGetCatchUp).not.toHaveBeenCalled();
  });

  it("changing the model picker calls updatePreferredAiModel", async () => {
    render(<Canvas threads={[]} tasks={[]} positions={{}} {...defaultThemeProps} />);

    fireEvent.change(screen.getByLabelText("AI model"), { target: { value: "gemini-2.5-flash" } });

    await waitFor(() => {
      expect(updatePreferredAiModel).toHaveBeenCalledWith("gemini-2.5-flash");
    });
  });
});
