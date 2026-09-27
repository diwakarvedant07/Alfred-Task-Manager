import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NewTaskButton from "@/components/canvas/NewTaskButton";

describe("NewTaskButton", () => {
  it("opens a form and submits the title", () => {
    const onCreate = vi.fn();
    render(<NewTaskButton threadId="th1" onCreate={onCreate} />);

    fireEvent.click(screen.getByRole("button", { name: "New task" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Draft summary" } });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    expect(onCreate).toHaveBeenCalledWith({ title: "Draft summary" });
  });

  it("submits description and due date along with the title when provided", () => {
    const onCreate = vi.fn();
    render(<NewTaskButton threadId="th1" onCreate={onCreate} />);

    fireEvent.click(screen.getByRole("button", { name: "New task" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Draft summary" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Pull Q3 numbers" } });
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-04-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    expect(onCreate).toHaveBeenCalledWith({
      title: "Draft summary",
      description: "Pull Q3 numbers",
      dueDate: new Date("2026-04-01"),
    });
  });

  it("omits description and due date when left blank", () => {
    const onCreate = vi.fn();
    render(<NewTaskButton threadId="th1" onCreate={onCreate} />);

    fireEvent.click(screen.getByRole("button", { name: "New task" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Just a title" } });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    expect(onCreate).toHaveBeenCalledWith({
      title: "Just a title",
      description: undefined,
      dueDate: undefined,
    });
  });
});

describe("NewTaskButton — custom trigger", () => {
  it("uses renderTrigger instead of the default button", () => {
    render(
      <NewTaskButton
        threadId="th1"
        onCreate={vi.fn()}
        renderTrigger={(openDialog) => (
          <button type="button" onClick={openDialog}>
            Add task to Launch
          </button>
        )}
      />
    );
    expect(screen.queryByRole("button", { name: "New task" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add task to Launch" }));
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
  });
});
