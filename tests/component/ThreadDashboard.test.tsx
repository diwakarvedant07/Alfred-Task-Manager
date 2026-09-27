import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ThreadDashboard from "@/components/canvas/ThreadDashboard";

describe("ThreadDashboard", () => {
  it("shows the name and per-priority counts of open tasks", () => {
    const { container } = render(
      <ThreadDashboard name="Launch" color="#7f77dd" summary={{ high: 2, medium: 3, low: 1, done: 2, total: 8 }} />
    );
    expect(screen.getByText("Launch")).toBeInTheDocument();
    const counts = container.querySelector("[data-testid='priority-counts']")!;
    expect(counts).toHaveTextContent("!!!2!!3!1");
    expect(container.querySelector("[data-testid='progress-arc']")).not.toBeNull();
  });

  it("says 'No tasks' and hides the progress arc for an empty thread", () => {
    const { container } = render(
      <ThreadDashboard name="Empty" color="#7f77dd" summary={{ high: 0, medium: 0, low: 0, done: 0, total: 0 }} />
    );
    expect(screen.getByText("No tasks")).toBeInTheDocument();
    expect(container.querySelector("[data-testid='progress-arc']")).toBeNull();
  });
});
