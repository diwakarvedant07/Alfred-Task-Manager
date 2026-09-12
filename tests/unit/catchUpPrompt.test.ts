import { describe, it, expect } from "vitest";
import { buildCatchUpPrompt } from "@/lib/catchUpPrompt";
import type { ThreadActivity } from "@/lib/threadActivity";

describe("buildCatchUpPrompt", () => {
  it("says there is no previous summary yet, when previousSummary is null", () => {
    const activity: ThreadActivity = { tasks: [], updates: [] };
    const prompt = buildCatchUpPrompt("Q3 Report", null, activity);
    expect(prompt).toContain("no previous summary yet");
    expect(prompt).not.toContain("Previous summary:");
  });

  it("includes the previous summary text when one exists", () => {
    const activity: ThreadActivity = { tasks: [], updates: [] };
    const prompt = buildCatchUpPrompt("Q3 Report", "Ada finished the intro.", activity);
    expect(prompt).toContain("Previous summary:");
    expect(prompt).toContain("Ada finished the intro.");
  });

  it("lists tasks with a NEW/UPDATED marker, status, priority, and due date", () => {
    const activity: ThreadActivity = {
      tasks: [
        {
          id: "t1",
          title: "Draft summary",
          workStatus: "IN_PROGRESS",
          priority: "HIGH",
          dueDate: new Date("2026-04-01"),
          isNew: true,
        },
        {
          id: "t2",
          title: "Pull metrics",
          workStatus: "DONE",
          priority: "MEDIUM",
          dueDate: null,
          isNew: false,
        },
      ],
      updates: [],
    };
    const prompt = buildCatchUpPrompt("Q3 Report", null, activity);
    expect(prompt).toContain('[NEW] "Draft summary" — IN_PROGRESS, HIGH priority, due 2026-04-01');
    expect(prompt).toContain('[UPDATED] "Pull metrics" — DONE, MEDIUM priority');
  });

  it("lists new comments with author and task title", () => {
    const activity: ThreadActivity = {
      tasks: [],
      updates: [
        { taskTitle: "Draft summary", authorName: "Ada", body: "Started the intro.", createdAt: new Date() },
      ],
    };
    const prompt = buildCatchUpPrompt("Q3 Report", null, activity);
    expect(prompt).toContain('Ada on "Draft summary": Started the intro.');
  });

  it("includes the thread name and an instruction to output only the summary", () => {
    const activity: ThreadActivity = { tasks: [], updates: [] };
    const prompt = buildCatchUpPrompt("Q3 Report", null, activity);
    expect(prompt).toContain("Q3 Report");
    expect(prompt).toContain("Write only the updated summary text");
  });
});
