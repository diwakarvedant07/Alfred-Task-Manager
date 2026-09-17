import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import JarvisChat from "@/components/jarvis/JarvisChat";

const MESSAGES = [
  { id: "1", role: "USER" as const, content: "hi", toolCalls: null, totalTokens: null },
  { id: "2", role: "ASSISTANT" as const, content: "hello!", toolCalls: null, totalTokens: 42 },
];

describe("JarvisChat", () => {
  it("renders messages and the session title", () => {
    render(
      <JarvisChat
        sessionTitle="Rocket Launch Prep"
        messages={MESSAGES}
        sending={false}
        error={null}
        onSend={vi.fn()}
        onRenameSession={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Rocket Launch Prep")).toBeInTheDocument();
    const rendered = screen.getAllByTestId("jarvis-message");
    expect(rendered.map((m) => m.textContent)).toEqual([
      expect.stringContaining("hi"),
      expect.stringContaining("hello!"),
    ]);
  });

  it("falls back to \"New chat\" when the title is null", () => {
    render(
      <JarvisChat
        sessionTitle={null}
        messages={[]}
        sending={false}
        error={null}
        onSend={vi.fn()}
        onRenameSession={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("New chat")).toBeInTheDocument();
  });

  it("shows the running token total, summed across assistant messages only", () => {
    render(
      <JarvisChat
        sessionTitle="x"
        messages={MESSAGES}
        sending={false}
        error={null}
        onSend={vi.fn()}
        onRenameSession={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // "42 tokens" legitimately renders twice: once as the header running
    // total, and once in the assistant message's own per-message token
    // footer (both come straight from the same 42-token fixture). Anchor
    // the assertion to the occurrence outside any message bubble so it
    // targets the running total specifically, not either occurrence.
    const occurrences = screen.getAllByText("42 tokens");
    expect(occurrences.some((el) => !el.closest('[data-testid="jarvis-message"]'))).toBe(true);
  });

  it("shows a loading indicator while sending, and hides it once not sending", () => {
    const { rerender } = render(
      <JarvisChat
        sessionTitle="x"
        messages={MESSAGES}
        sending={true}
        error={null}
        onSend={vi.fn()}
        onRenameSession={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByTestId("jarvis-loading")).toBeInTheDocument();

    rerender(
      <JarvisChat
        sessionTitle="x"
        messages={MESSAGES}
        sending={false}
        error={null}
        onSend={vi.fn()}
        onRenameSession={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByTestId("jarvis-loading")).not.toBeInTheDocument();
  });

  it("sends a trimmed message and clears the draft", () => {
    const onSend = vi.fn();
    render(
      <JarvisChat
        sessionTitle="x"
        messages={[]}
        sending={false}
        error={null}
        onSend={onSend}
        onRenameSession={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Message Jarvis"), { target: { value: "  call the vendor  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).toHaveBeenCalledWith("call the vendor");
    expect(screen.getByLabelText("Message Jarvis")).toHaveValue("");
  });

  it("does not send an empty message", () => {
    const onSend = vi.fn();
    render(
      <JarvisChat
        sessionTitle="x"
        messages={[]}
        sending={false}
        error={null}
        onSend={onSend}
        onRenameSession={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("shows the error alert when error is set", () => {
    render(
      <JarvisChat
        sessionTitle="x"
        messages={[]}
        sending={false}
        error="Couldn't reach Jarvis — please try again."
        onSend={vi.fn()}
        onRenameSession={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't reach Jarvis");
  });

  it("renames the session on Enter after clicking the title", () => {
    const onRenameSession = vi.fn();
    render(
      <JarvisChat
        sessionTitle="Old title"
        messages={[]}
        sending={false}
        error={null}
        onSend={vi.fn()}
        onRenameSession={onRenameSession}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Old title" }));
    const input = screen.getByLabelText("Session title");
    fireEvent.change(input, { target: { value: "New title" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRenameSession).toHaveBeenCalledWith("New title");
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <JarvisChat
        sessionTitle="x"
        messages={[]}
        sending={false}
        error={null}
        onSend={vi.fn()}
        onRenameSession={vi.fn()}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
