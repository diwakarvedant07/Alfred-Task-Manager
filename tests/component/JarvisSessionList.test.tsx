import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import JarvisSessionList from "@/components/jarvis/JarvisSessionList";

const SESSIONS = [
  { id: "s1", title: "Rocket Launch Prep", updatedAt: new Date() },
  { id: "s2", title: null, updatedAt: new Date() },
];

describe("JarvisSessionList", () => {
  it("renders sessions, using \"New chat\" as the placeholder for a null title", () => {
    render(
      <JarvisSessionList
        sessions={SESSIONS}
        activeSessionId={null}
        onNewChat={vi.fn()}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText("Rocket Launch Prep")).toBeInTheDocument();
    expect(screen.getAllByText("New chat")).toHaveLength(2); // the button + the untitled session
  });

  it("calls onNewChat when the New chat button is clicked", () => {
    const onNewChat = vi.fn();
    render(
      <JarvisSessionList
        sessions={SESSIONS}
        activeSessionId={null}
        onNewChat={onNewChat}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /^new chat$/i }));
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it("calls onSelect when a session is clicked", () => {
    const onSelect = vi.fn();
    render(
      <JarvisSessionList
        sessions={SESSIONS}
        activeSessionId={null}
        onNewChat={vi.fn()}
        onSelect={onSelect}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Rocket Launch Prep"));
    expect(onSelect).toHaveBeenCalledWith("s1");
  });

  it("calls onDelete without opening a rename field, when the delete icon is clicked", () => {
    const onDelete = vi.fn();
    const onSelect = vi.fn();
    render(
      <JarvisSessionList
        sessions={SESSIONS}
        activeSessionId={null}
        onNewChat={vi.fn()}
        onSelect={onSelect}
        onRename={vi.fn()}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Delete session" })[0]);
    expect(onDelete).toHaveBeenCalledWith("s1");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renames a session on Enter after clicking the rename icon", () => {
    const onRename = vi.fn();
    render(
      <JarvisSessionList
        sessions={SESSIONS}
        activeSessionId={null}
        onNewChat={vi.fn()}
        onSelect={vi.fn()}
        onRename={onRename}
        onDelete={vi.fn()}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Rename session" })[0]);
    const input = screen.getByLabelText("Session title");
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRename).toHaveBeenCalledWith("s1", "Renamed");
  });
});
