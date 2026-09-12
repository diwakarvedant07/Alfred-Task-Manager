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

import { openThreadAndMaybeGetCatchUp, getStoredThreadSummary } from "@/app/actions/threadCatchUp";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("thread catch-up actions", () => {
  let ownerId: string;
  let strangerId: string;
  let threadId: string;

  beforeEach(async () => {
    await resetDb();
    vi.mocked(generateText).mockReset();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const stranger = await db.user.create({ data: { email: "stranger@x.com", passwordHash: "x", name: "Stranger" } });
    ownerId = owner.id;
    strangerId = stranger.id;

    await loginAs(ownerId);
    const thread = await createThread({ name: "Q3 Report", categoryColor: "#f2c14e" });
    threadId = thread.id;
  });
  afterAll(async () => db.$disconnect());

  it("never viewed before: records the view, does not show a catch-up, does not call Gemini", async () => {
    await loginAs(ownerId);
    const now = new Date("2026-03-01T00:00:00Z");
    const result = await openThreadAndMaybeGetCatchUp(threadId, now);

    expect(result).toEqual({ showCatchUp: false, summary: null });
    expect(generateText).not.toHaveBeenCalled();

    const view = await db.threadView.findUnique({ where: { threadId_userId: { threadId, userId: ownerId } } });
    expect(view?.lastViewedAt).toEqual(now);
  });

  it("viewed again within 24h: not stale, no catch-up", async () => {
    await loginAs(ownerId);
    const firstView = new Date("2026-03-01T00:00:00Z");
    await openThreadAndMaybeGetCatchUp(threadId, firstView);

    const secondView = new Date(firstView.getTime() + 60 * 60 * 1000);
    const result = await openThreadAndMaybeGetCatchUp(threadId, secondView);

    expect(result.showCatchUp).toBe(false);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("stale with no activity and no prior summary: shows a fixed message, no Gemini call", async () => {
    await loginAs(ownerId);
    const firstView = new Date("2026-03-01T00:00:00Z");
    await openThreadAndMaybeGetCatchUp(threadId, firstView);

    const staleView = new Date(firstView.getTime() + 25 * 60 * 60 * 1000);
    const result = await openThreadAndMaybeGetCatchUp(threadId, staleView);

    expect(result.showCatchUp).toBe(true);
    expect(result.summary).toBe("Nothing to catch up on yet.");
    expect(generateText).not.toHaveBeenCalled();
  });

  it("stale with new activity and no prior summary: calls Gemini and persists the summary", async () => {
    await loginAs(ownerId);
    const firstView = new Date("2026-03-01T00:00:00Z");
    await openThreadAndMaybeGetCatchUp(threadId, firstView);
    await createTask({ primaryThreadId: threadId, title: "Draft summary" });

    vi.mocked(generateText).mockResolvedValue("Ada started drafting the summary.");

    const staleView = new Date(firstView.getTime() + 25 * 60 * 60 * 1000);
    const result = await openThreadAndMaybeGetCatchUp(threadId, staleView);

    expect(result.showCatchUp).toBe(true);
    expect(result.summary).toBe("Ada started drafting the summary.");
    expect(generateText).toHaveBeenCalledTimes(1);

    const stored = await db.threadSummary.findUnique({ where: { threadId } });
    expect(stored?.summaryText).toBe("Ada started drafting the summary.");
    expect(stored?.lastIncludedAt).toEqual(staleView);
  });

  it("stale with an existing summary and no new activity since it: reuses the stored text, no Gemini call", async () => {
    await loginAs(ownerId);
    // Anchor on real "now" rather than a fixed past literal: the task's
    // createdAt is set by the real clock (createTask doesn't accept an
    // override), so lastIncludedAt must be computed relative to that same
    // real clock or the "no new activity since the cursor" comparison
    // below is meaningless.
    const firstView = new Date();
    await openThreadAndMaybeGetCatchUp(threadId, firstView);
    await createTask({ primaryThreadId: threadId, title: "Draft summary" });
    vi.mocked(generateText).mockResolvedValue("First summary.");
    const staleView1 = new Date(firstView.getTime() + 25 * 60 * 60 * 1000);
    await openThreadAndMaybeGetCatchUp(threadId, staleView1);

    vi.mocked(generateText).mockReset();
    const staleView2 = new Date(staleView1.getTime() + 25 * 60 * 60 * 1000);
    const result = await openThreadAndMaybeGetCatchUp(threadId, staleView2);

    expect(result.showCatchUp).toBe(true);
    expect(result.summary).toBe("First summary.");
    expect(generateText).not.toHaveBeenCalled();
  });

  it("uses the calling user's preferredAiModel", async () => {
    await loginAs(ownerId);
    await db.user.update({ where: { id: ownerId }, data: { preferredAiModel: "gemini-2.5-flash" } });
    // A first view must happen before a stale one is possible — a thread
    // with no ThreadView row yet is never "stale" (see isThreadStale).
    const firstView = new Date();
    await openThreadAndMaybeGetCatchUp(threadId, firstView);
    await createTask({ primaryThreadId: threadId, title: "Task" });
    vi.mocked(generateText).mockResolvedValue("Summary.");

    const staleView = new Date(firstView.getTime() + 25 * 60 * 60 * 1000);
    await openThreadAndMaybeGetCatchUp(threadId, staleView);

    expect(generateText).toHaveBeenCalledWith("gemini-2.5-flash", expect.any(String));
  });

  it("blocks a stranger with no access", async () => {
    await loginAs(strangerId);
    await expect(openThreadAndMaybeGetCatchUp(threadId)).rejects.toThrow(PermissionError);
  });

  it("getStoredThreadSummary returns null when none exists, the text when it does, and never touches ThreadView", async () => {
    await loginAs(ownerId);
    expect(await getStoredThreadSummary(threadId)).toBeNull();

    const firstView = new Date();
    await openThreadAndMaybeGetCatchUp(threadId, firstView);
    await createTask({ primaryThreadId: threadId, title: "Task" });
    vi.mocked(generateText).mockResolvedValue("Stored summary.");
    const staleView = new Date(firstView.getTime() + 25 * 60 * 60 * 1000);
    await openThreadAndMaybeGetCatchUp(threadId, staleView);

    const before = await db.threadView.findUnique({ where: { threadId_userId: { threadId, userId: ownerId } } });
    const text = await getStoredThreadSummary(threadId);
    const after = await db.threadView.findUnique({ where: { threadId_userId: { threadId, userId: ownerId } } });

    expect(text).toBe("Stored summary.");
    expect(after?.lastViewedAt).toEqual(before?.lastViewedAt);
  });
});
