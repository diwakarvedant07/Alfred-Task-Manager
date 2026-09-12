import { describe, it, expect } from "vitest";
import { buildJarvisSystemPrompt } from "@/lib/jarvisPrompt";

describe("buildJarvisSystemPrompt", () => {
  it("lists each thread's id, name, and summary when present", () => {
    const prompt = buildJarvisSystemPrompt([
      { id: "t1", name: "Q3 Report", summary: "Waiting on legal sign-off." },
      { id: "t2", name: "Onboarding", summary: null },
    ]);

    expect(prompt).toContain("t1");
    expect(prompt).toContain("Q3 Report");
    expect(prompt).toContain("Waiting on legal sign-off.");
    expect(prompt).toContain("t2");
    expect(prompt).toContain("Onboarding");
  });

  it("says explicitly when the user has no threads yet", () => {
    const prompt = buildJarvisSystemPrompt([]);

    expect(prompt.toLowerCase()).toContain("no threads yet");
  });

  it("instructs the model to prefer an existing thread over creating a new one", () => {
    const prompt = buildJarvisSystemPrompt([{ id: "t1", name: "Q3 Report", summary: null }]);

    expect(prompt.toLowerCase()).toContain("existing thread");
  });
});
