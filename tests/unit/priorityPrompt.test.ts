import { describe, it, expect } from "vitest";
import { buildPriorityPrompt, parsePriorityResponse } from "@/lib/priorityPrompt";

describe("buildPriorityPrompt", () => {
  it("includes the task's title, description, and due date", () => {
    const prompt = buildPriorityPrompt(
      { title: "Fix login bug", description: "Users can't sign in on mobile.", dueDate: new Date("2026-04-01") },
      "Q3 Report",
      []
    );
    expect(prompt).toContain("Fix login bug");
    expect(prompt).toContain("Users can't sign in on mobile.");
    expect(prompt).toContain("2026-04-01");
    expect(prompt).toContain("Q3 Report");
  });

  it("notes when there is no description or due date", () => {
    const prompt = buildPriorityPrompt({ title: "Task", description: "", dueDate: null }, "Thread", []);
    expect(prompt).toContain("(none provided)");
    expect(prompt).toContain("(none set)");
  });

  it("includes calibration thread summaries when provided", () => {
    const prompt = buildPriorityPrompt(
      { title: "Task", description: "", dueDate: null },
      "Thread",
      [{ name: "Client Launch", summary: "Waiting on legal sign-off, blocking release." }]
    );
    expect(prompt).toContain("Client Launch");
    expect(prompt).toContain("Waiting on legal sign-off, blocking release.");
  });

  it("says to respond with exactly one word", () => {
    const prompt = buildPriorityPrompt({ title: "Task", description: "", dueDate: null }, "Thread", []);
    expect(prompt).toContain("Respond with exactly one word: LOW, MEDIUM, or HIGH");
  });
});

describe("parsePriorityResponse", () => {
  it("matches exact tokens case-insensitively", () => {
    expect(parsePriorityResponse("HIGH")).toBe("HIGH");
    expect(parsePriorityResponse("low")).toBe("LOW");
    expect(parsePriorityResponse("Medium")).toBe("MEDIUM");
  });

  it("trims surrounding whitespace", () => {
    expect(parsePriorityResponse("  HIGH  \n")).toBe("HIGH");
  });

  it("finds a valid token even with stray extra text", () => {
    expect(parsePriorityResponse("I'd say HIGH priority.")).toBe("HIGH");
  });

  it("falls back to MEDIUM for anything unparseable", () => {
    expect(parsePriorityResponse("")).toBe("MEDIUM");
    expect(parsePriorityResponse("I'm not sure.")).toBe("MEDIUM");
  });
});
