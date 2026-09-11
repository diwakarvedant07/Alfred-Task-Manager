import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NewThreadButton from "@/components/canvas/NewThreadButton";

describe("NewThreadButton", () => {
  it("opens a form and submits the thread name and color", () => {
    const onCreate = vi.fn();
    render(<NewThreadButton onCreate={onCreate} />);

    fireEvent.click(screen.getByRole("button", { name: "New thread" }));
    fireEvent.change(screen.getByLabelText("Thread name"), { target: { value: "Q3 Report" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(onCreate).toHaveBeenCalledWith({ name: "Q3 Report", categoryColor: expect.any(String) });
  });
});
