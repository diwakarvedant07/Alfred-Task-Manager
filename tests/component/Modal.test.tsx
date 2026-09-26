import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Modal from "@/components/ui/Modal";

describe("Modal", () => {
  it("renders children inside a dialog with the given accessible name", () => {
    render(
      <Modal ariaLabel="Example dialog" onClose={vi.fn()}>
        <p>Content</p>
      </Modal>
    );

    expect(screen.getByRole("dialog", { name: "Example dialog" })).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("calls onClose when the backdrop is clicked, but not when the card itself is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal ariaLabel="Example dialog" onClose={onClose}>
        <p>Content</p>
      </Modal>
    );

    fireEvent.click(screen.getByText("Content"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog", { name: "Example dialog" }).parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal ariaLabel="Example dialog" onClose={onClose}>
        <p>Content</p>
      </Modal>
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps focus on an autoFocus field inside the dialog instead of moving it to the card", () => {
    render(
      <Modal ariaLabel="Example dialog" onClose={vi.fn()}>
        <input aria-label="Name" autoFocus />
      </Modal>
    );

    expect(screen.getByLabelText("Name")).toHaveFocus();
  });

  it("focuses the dialog card when nothing inside it takes focus", () => {
    render(
      <Modal ariaLabel="Example dialog" onClose={vi.fn()}>
        <p>Content</p>
      </Modal>
    );

    expect(screen.getByRole("dialog", { name: "Example dialog" })).toHaveFocus();
  });
});
