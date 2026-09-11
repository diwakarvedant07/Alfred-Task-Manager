import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import CardMenu from "@/components/canvas/CardMenu";

describe("CardMenu", () => {
  it("opens on click and invokes the right handler for a task variant", () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(
      <CardMenu
        variant="task"
        onRename={onRename}
        onMoveToThread={vi.fn()}
        onLinkSecondaryThread={vi.fn()}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByText("Rename"));
    expect(onRename).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalled();
  });

  it("shows Close and no Move/Link items for a thread variant", () => {
    render(
      <CardMenu
        variant="thread"
        onRename={vi.fn()}
        onChangeColor={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByText("Close thread")).toBeInTheDocument();
    expect(screen.queryByText("Move to thread…")).not.toBeInTheDocument();
  });

  it("hides Rename/Change color for a thread variant when canEditMeta is false", () => {
    render(
      <CardMenu
        variant="thread"
        onRename={vi.fn()}
        onChangeColor={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        canEditMeta={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.queryByText("Rename thread")).not.toBeInTheDocument();
    expect(screen.queryByText("Change category color")).not.toBeInTheDocument();
    // Close/Delete default to visible since canCloseOrDelete wasn't passed.
    expect(screen.getByText("Close thread")).toBeInTheDocument();
  });

  it("hides Close/Delete for a thread variant when canCloseOrDelete is false", () => {
    render(
      <CardMenu
        variant="thread"
        onRename={vi.fn()}
        onChangeColor={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        canCloseOrDelete={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.queryByText("Close thread")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete thread")).not.toBeInTheDocument();
    // Rename/Change color default to visible since canEditMeta wasn't passed.
    expect(screen.getByText("Rename thread")).toBeInTheDocument();
  });

  it("opens on long-press (pointer down held past the threshold)", () => {
    vi.useFakeTimers();
    const onRename = vi.fn();
    render(
      <CardMenu
        variant="task"
        onRename={onRename}
        onMoveToThread={vi.fn()}
        onLinkSecondaryThread={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const card = screen.getByTestId("card-menu-trigger-area");
    fireEvent.pointerDown(card);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.pointerUp(card);

    expect(screen.getByText("Rename")).toBeInTheDocument();
    vi.useRealTimers();
  });
});
