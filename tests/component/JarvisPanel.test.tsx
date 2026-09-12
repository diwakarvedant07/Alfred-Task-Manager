import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import JarvisPanel from "@/components/jarvis/JarvisPanel";

vi.mock("@/app/actions/jarvis", () => ({ sendJarvisMessage: vi.fn() }));
import { sendJarvisMessage } from "@/app/actions/jarvis";

describe("JarvisPanel", () => {
  beforeEach(() => {
    vi.mocked(sendJarvisMessage).mockReset();
  });

  it("is collapsed by default and can be toggled open", () => {
    render(<JarvisPanel initialMessages={[]} />);

    expect(screen.queryByLabelText("Message Jarvis")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Jarvis" }));
    expect(screen.getByLabelText("Message Jarvis")).toBeInTheDocument();
  });

  it("renders initial messages, oldest first", () => {
    render(
      <JarvisPanel
        initialMessages={[
          { id: "1", role: "USER", content: "hi", toolCalls: null },
          { id: "2", role: "ASSISTANT", content: "hello!", toolCalls: null },
        ]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Jarvis" }));

    const messages = screen.getAllByTestId("jarvis-message");
    expect(messages.map((m) => m.textContent)).toEqual([expect.stringContaining("hi"), expect.stringContaining("hello!")]);
  });

  it("sends a message and appends both the user and assistant replies", async () => {
    vi.mocked(sendJarvisMessage).mockResolvedValue({
      userMessage: { id: "u1", role: "USER", content: "call the vendor", toolCalls: null } as never,
      assistantMessage: {
        id: "a1",
        role: "ASSISTANT",
        content: "Created that task.",
        toolCalls: [{ tool: "createTaskInThread", success: true, summary: "Created task X in Y" }],
      } as never,
    });
    render(<JarvisPanel initialMessages={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Jarvis" }));

    fireEvent.change(screen.getByLabelText("Message Jarvis"), { target: { value: "call the vendor" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText("Created that task.")).toBeInTheDocument());
    expect(screen.getByText("✓ Created task X in Y")).toBeInTheDocument();
    expect(sendJarvisMessage).toHaveBeenCalledWith("call the vendor");
  });

  it("shows a failed chip with an ✗ prefix", async () => {
    vi.mocked(sendJarvisMessage).mockResolvedValue({
      userMessage: { id: "u1", role: "USER", content: "x", toolCalls: null } as never,
      assistantMessage: {
        id: "a1",
        role: "ASSISTANT",
        content: "Couldn't do that.",
        toolCalls: [{ tool: "createTaskInThread", success: false, summary: "No access to that thread" }],
      } as never,
    });
    render(<JarvisPanel initialMessages={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Jarvis" }));

    fireEvent.change(screen.getByLabelText("Message Jarvis"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText("✗ No access to that thread")).toBeInTheDocument());
  });

  it("shows a visible error state when sendJarvisMessage rejects", async () => {
    vi.mocked(sendJarvisMessage).mockRejectedValue(new Error("network down"));
    render(<JarvisPanel initialMessages={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Jarvis" }));

    fireEvent.change(screen.getByLabelText("Message Jarvis"), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText(/couldn't reach jarvis/i)).toBeInTheDocument());
  });

  it("does not send an empty message", () => {
    render(<JarvisPanel initialMessages={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Jarvis" }));

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(sendJarvisMessage).not.toHaveBeenCalled();
  });
});
