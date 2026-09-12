import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TaskDetailPanel from "@/components/task-detail/TaskDetailPanel";

const task = {
  id: "t1",
  title: "Draft exec summary",
  description: "Pull together the Q3 numbers.",
  workStatus: "IN_PROGRESS" as const,
  priority: "HIGH" as const,
  priorityIsAiSuggested: false,
  dueDate: null,
};

const updates = [{ id: "u1", body: "Started on the intro.", authorId: "a1", createdAt: new Date("2026-01-01") }];

describe("TaskDetailPanel", () => {
  it("shows the task fields and comment log", () => {
    render(
      <TaskDetailPanel task={task} updates={updates} onUpdateTask={vi.fn()} onAddComment={vi.fn()} onClose={vi.fn()} />
    );

    expect(screen.getByDisplayValue("Draft exec summary")).toBeInTheDocument();
    expect(screen.getByText("Started on the intro.")).toBeInTheDocument();
  });

  it("submits a status change via onUpdateTask", () => {
    const onUpdateTask = vi.fn();
    render(
      <TaskDetailPanel task={task} updates={updates} onUpdateTask={onUpdateTask} onAddComment={vi.fn()} onClose={vi.fn()} />
    );

    fireEvent.change(screen.getByLabelText("Work status"), { target: { value: "DONE" } });
    expect(onUpdateTask).toHaveBeenCalledWith({ workStatus: "DONE" });
  });

  it("submits a new comment via onAddComment and clears the input", () => {
    const onAddComment = vi.fn();
    render(
      <TaskDetailPanel task={task} updates={updates} onUpdateTask={vi.fn()} onAddComment={onAddComment} onClose={vi.fn()} />
    );

    const input = screen.getByLabelText("Add an update") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Pulled the numbers." } });
    fireEvent.click(screen.getByText("Post update"));

    expect(onAddComment).toHaveBeenCalledWith("Pulled the numbers.");
    expect(input.value).toBe("");
  });

  it("shows an AI badge next to priority when priorityIsAiSuggested is true", () => {
    render(
      <TaskDetailPanel
        task={{ ...task, priorityIsAiSuggested: true }}
        updates={updates}
        onUpdateTask={vi.fn()}
        onAddComment={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByLabelText("AI suggested")).toBeInTheDocument();
  });

  it("does not show an AI badge when priorityIsAiSuggested is false", () => {
    render(
      <TaskDetailPanel
        task={{ ...task, priorityIsAiSuggested: false }}
        updates={updates}
        onUpdateTask={vi.fn()}
        onAddComment={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByLabelText("AI suggested")).not.toBeInTheDocument();
  });
});
