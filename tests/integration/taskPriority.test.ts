import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { createThread } from "@/app/actions/threads";
import { createTask } from "@/app/actions/tasks";
import { PermissionError } from "@/lib/permissions";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

vi.mock("@/lib/gemini", () => ({ generateText: vi.fn() }));
import { generateText } from "@/lib/gemini";

import { suggestTaskPriority } from "@/app/actions/taskPriority";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("suggestTaskPriority", () => {
  let ownerId: string;
  let viewerId: string;
  let threadId: string;
  let taskId: string;

  beforeEach(async () => {
    await resetDb();
    vi.mocked(generateText).mockReset();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const viewer = await db.user.create({ data: { email: "viewer@x.com", passwordHash: "x", name: "Viewer" } });
    ownerId = owner.id;
    viewerId = viewer.id;

    await loginAs(ownerId);
    const thread = await createThread({ name: "Q3 Report", categoryColor: "#f2c14e" });
    threadId = thread.id;
    await db.threadShare.create({ data: { threadId, sharedWithUserId: viewerId, permission: "VIEWER" } });
    const task = await createTask({
      primaryThreadId: threadId,
      title: "Fix login bug",
      description: "Users can't sign in on mobile.",
    });
    taskId = task.id;
  });
  afterAll(async () => db.$disconnect());

  it("sets the task's priority from the AI response and marks it AI-suggested", async () => {
    await loginAs(ownerId);
    vi.mocked(generateText).mockResolvedValue("HIGH");

    const updated = await suggestTaskPriority(taskId);

    expect(updated.priority).toBe("HIGH");
    expect(updated.priorityIsAiSuggested).toBe(true);
  });

  it("falls back to MEDIUM when the AI response is unparseable", async () => {
    await loginAs(ownerId);
    vi.mocked(generateText).mockResolvedValue("uh, not sure honestly");

    const updated = await suggestTaskPriority(taskId);

    expect(updated.priority).toBe("MEDIUM");
    expect(updated.priorityIsAiSuggested).toBe(true);
  });

  it("uses the calling user's preferredAiModel", async () => {
    await loginAs(ownerId);
    await db.user.update({ where: { id: ownerId }, data: { preferredAiModel: "gemini-2.5-flash" } });
    vi.mocked(generateText).mockResolvedValue("LOW");

    await suggestTaskPriority(taskId);

    expect(generateText).toHaveBeenCalledWith("gemini-2.5-flash", expect.any(String));
  });

  it("includes calibration context from other threads' summaries in the prompt", async () => {
    await loginAs(ownerId);
    const otherThread = await createThread({ name: "Client Launch", categoryColor: "#38e0ff" });
    await db.threadSummary.create({
      data: { threadId: otherThread.id, summaryText: "Waiting on legal sign-off.", lastIncludedAt: new Date() },
    });
    vi.mocked(generateText).mockResolvedValue("HIGH");

    await suggestTaskPriority(taskId);

    const promptArg = vi.mocked(generateText).mock.calls[0][1];
    expect(promptArg).toContain("Client Launch");
    expect(promptArg).toContain("Waiting on legal sign-off.");
  });

  it("a viewer is blocked (needs edit access)", async () => {
    await loginAs(viewerId);
    await expect(suggestTaskPriority(taskId)).rejects.toThrow(PermissionError);
    expect(generateText).not.toHaveBeenCalled();
  });
});
