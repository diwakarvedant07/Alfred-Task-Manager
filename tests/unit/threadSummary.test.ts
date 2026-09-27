import { describe, it, expect } from "vitest";
import { summarizeThread, threadAriaLabel, taskAriaLabel, priorityMarks } from "@/components/canvas/threadSummary";

describe("summarizeThread", () => {
  it("counts unfinished tasks by priority and done tasks separately", () => {
    expect(
      summarizeThread([
        { priority: "HIGH", workStatus: "TODO" },
        { priority: "HIGH", workStatus: "DONE" },
        { priority: "MEDIUM", workStatus: "IN_PROGRESS" },
        { priority: "LOW", workStatus: "TODO" },
      ])
    ).toEqual({ high: 1, medium: 1, low: 1, done: 1, total: 4 });
  });
});

describe("labels", () => {
  it("describes a thread for screen readers", () => {
    expect(threadAriaLabel("Launch", { high: 2, medium: 3, low: 2, done: 1, total: 8 })).toBe(
      "Launch — 2 high, 3 medium, 2 low open, 1 done. Open thread"
    );
    expect(threadAriaLabel("Empty", { high: 0, medium: 0, low: 0, done: 0, total: 0 })).toBe(
      "Empty — no tasks. Open thread"
    );
  });

  it("describes a task with its priority and status", () => {
    expect(taskAriaLabel({ title: "Ship API", priority: "HIGH", workStatus: "IN_PROGRESS" })).toBe(
      "Ship API, high priority, in progress"
    );
    expect(taskAriaLabel({ title: "Docs", priority: "LOW", workStatus: "DONE" })).toBe("Docs, low priority, done");
    expect(taskAriaLabel({ title: "Plan", priority: "MEDIUM", workStatus: "TODO" })).toBe("Plan, medium priority");
  });

  it("maps priorities to exclamation marks", () => {
    expect([priorityMarks("HIGH"), priorityMarks("MEDIUM"), priorityMarks("LOW")]).toEqual(["!!!", "!!", "!"]);
  });
});
