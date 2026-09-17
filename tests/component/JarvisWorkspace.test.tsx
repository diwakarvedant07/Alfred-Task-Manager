import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import JarvisWorkspace from "@/components/jarvis/JarvisWorkspace";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

vi.mock("@/app/actions/jarvisSessions", () => ({
  createJarvisSession: vi.fn(),
  listJarvisSessions: vi.fn(),
  renameJarvisSession: vi.fn(),
  deleteJarvisSession: vi.fn(),
  listJarvisMessages: vi.fn(),
}));
import {
  createJarvisSession,
  listJarvisSessions,
  renameJarvisSession,
  deleteJarvisSession,
  listJarvisMessages,
} from "@/app/actions/jarvisSessions";

vi.mock("@/app/actions/jarvis", () => ({ sendJarvisMessage: vi.fn() }));
import { sendJarvisMessage } from "@/app/actions/jarvis";

const SESSIONS = [{ id: "s1", title: "Rocket Launch Prep", updatedAt: new Date() }];

describe("JarvisWorkspace", () => {
  beforeEach(() => {
    vi.mocked(listJarvisMessages).mockResolvedValue([]);
    vi.mocked(listJarvisSessions).mockResolvedValue(SESSIONS as never);
    refresh.mockReset();
  });

  it("loads and shows the first session's messages on mount", async () => {
    vi.mocked(listJarvisMessages).mockResolvedValue([
      { id: "m1", role: "USER", content: "hi", toolCalls: null, totalTokens: null },
    ] as never);

    render(<JarvisWorkspace initialSessions={SESSIONS} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("jarvis-message")).toHaveTextContent("hi"));
    expect(listJarvisMessages).toHaveBeenCalledWith("s1");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<JarvisWorkspace initialSessions={SESSIONS} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes via the close button", () => {
    const onClose = vi.fn();
    render(<JarvisWorkspace initialSessions={SESSIONS} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("switching sessions loads that session's messages", async () => {
    vi.mocked(listJarvisSessions).mockResolvedValue([
      { id: "s1", title: "First", updatedAt: new Date() },
      { id: "s2", title: "Second", updatedAt: new Date() },
    ] as never);
    render(
      <JarvisWorkspace
        initialSessions={[
          { id: "s1", title: "First", updatedAt: new Date() },
          { id: "s2", title: "Second", updatedAt: new Date() },
        ]}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(listJarvisMessages).toHaveBeenCalledWith("s1"));

    vi.mocked(listJarvisMessages).mockResolvedValue([
      { id: "m2", role: "USER", content: "second session message", toolCalls: null, totalTokens: null },
    ] as never);
    fireEvent.click(screen.getByText("Second"));

    await waitFor(() => expect(listJarvisMessages).toHaveBeenCalledWith("s2"));
    await waitFor(() => expect(screen.getByTestId("jarvis-message")).toHaveTextContent("second session message"));
  });

  it("creates a new session and switches to it", async () => {
    vi.mocked(createJarvisSession).mockResolvedValue({ id: "new-session", title: null } as never);
    render(<JarvisWorkspace initialSessions={SESSIONS} onClose={vi.fn()} />);
    await waitFor(() => expect(listJarvisMessages).toHaveBeenCalledWith("s1"));

    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));

    await waitFor(() => expect(createJarvisSession).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(listJarvisMessages).toHaveBeenCalledWith("new-session"));
  });

  it("sends a message: shows it optimistically, then replaces with the server's messages and refreshes the router", async () => {
    vi.mocked(sendJarvisMessage).mockResolvedValue({
      userMessage: { id: "u1" } as never,
      assistantMessage: { id: "a1" } as never,
    });
    render(<JarvisWorkspace initialSessions={SESSIONS} onClose={vi.fn()} />);
    await waitFor(() => expect(listJarvisMessages).toHaveBeenCalledWith("s1"));

    vi.mocked(listJarvisMessages).mockResolvedValue([
      { id: "u1", role: "USER", content: "call the vendor", toolCalls: null, totalTokens: null },
      { id: "a1", role: "ASSISTANT", content: "Done.", toolCalls: null, totalTokens: 12 },
    ] as never);

    fireEvent.change(screen.getByLabelText("Message Jarvis"), { target: { value: "call the vendor" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByTestId("jarvis-loading")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Done.")).toBeInTheDocument());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows an error, removes the optimistic message, and restores the typed draft when sendJarvisMessage rejects", async () => {
    vi.mocked(sendJarvisMessage).mockRejectedValue(new Error("network down"));
    render(<JarvisWorkspace initialSessions={SESSIONS} onClose={vi.fn()} />);
    await waitFor(() => expect(listJarvisMessages).toHaveBeenCalledWith("s1"));

    fireEvent.change(screen.getByLabelText("Message Jarvis"), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/couldn't reach jarvis/i));
    // The optimistic "hi" chat bubble is gone from the message list...
    expect(screen.queryAllByTestId("jarvis-message").some((el) => el.textContent?.includes("hi"))).toBe(false);
    // ...but the typed text is restored to the composer rather than lost --
    // handleSend returns false on failure so JarvisChat can put it back.
    expect(screen.getByLabelText("Message Jarvis")).toHaveValue("hi");
  });

  it("sending with no active session auto-creates one first, then sends to it", async () => {
    vi.mocked(listJarvisSessions).mockResolvedValueOnce([]).mockResolvedValue([
      { id: "brand-new", title: "hey there", updatedAt: new Date() },
    ] as never);
    vi.mocked(createJarvisSession).mockResolvedValue({ id: "brand-new", title: null } as never);
    vi.mocked(sendJarvisMessage).mockResolvedValue({
      userMessage: { id: "u1" } as never,
      assistantMessage: { id: "a1" } as never,
    });
    render(<JarvisWorkspace initialSessions={[]} onClose={vi.fn()} />);

    vi.mocked(listJarvisMessages).mockResolvedValue([
      { id: "u1", role: "USER", content: "hey there", toolCalls: null, totalTokens: null },
      { id: "a1", role: "ASSISTANT", content: "Hi!", toolCalls: null, totalTokens: 5 },
    ] as never);

    fireEvent.change(screen.getByLabelText("Message Jarvis"), { target: { value: "hey there" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(createJarvisSession).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(sendJarvisMessage).toHaveBeenCalledWith("brand-new", "hey there"));
    await waitFor(() => expect(screen.getByText("Hi!")).toBeInTheDocument());
  });

  it("deletes a session and falls back to another remaining one", async () => {
    vi.mocked(listJarvisSessions)
      .mockResolvedValueOnce([
        { id: "s1", title: "First", updatedAt: new Date() },
        { id: "s2", title: "Second", updatedAt: new Date() },
      ] as never)
      .mockResolvedValue([{ id: "s2", title: "Second", updatedAt: new Date() }] as never);
    render(
      <JarvisWorkspace
        initialSessions={[
          { id: "s1", title: "First", updatedAt: new Date() },
          { id: "s2", title: "Second", updatedAt: new Date() },
        ]}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(listJarvisMessages).toHaveBeenCalledWith("s1"));

    fireEvent.click(screen.getAllByRole("button", { name: "Delete session" })[0]);

    await waitFor(() => expect(deleteJarvisSession).toHaveBeenCalledWith("s1"));
    await waitFor(() => expect(listJarvisMessages).toHaveBeenCalledWith("s2"));
  });
});
