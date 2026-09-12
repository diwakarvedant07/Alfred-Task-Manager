import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CatchUpModal from "@/components/canvas/CatchUpModal";

describe("CatchUpModal", () => {
  it("shows a loading message while loading, not the summary", () => {
    render(<CatchUpModal summary={null} loading={true} onClose={vi.fn()} />);
    expect(screen.getByText("Catching you up…")).toBeInTheDocument();
  });

  it("shows the summary text once loaded", () => {
    render(<CatchUpModal summary="You made great progress." loading={false} onClose={vi.fn()} />);
    expect(screen.getByText("You made great progress.")).toBeInTheDocument();
    expect(screen.queryByText("Catching you up…")).not.toBeInTheDocument();
  });

  it("calls onClose from both the close button and the Got it button", () => {
    const onClose = vi.fn();
    render(<CatchUpModal summary="Summary" loading={false} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Got it"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
