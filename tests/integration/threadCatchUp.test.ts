import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { createThread } from "@/app/actions/threads";
import { createTask } from "@/app/actions/tasks";
import { addTaskUpdate } from "@/app/actions/taskUpdates";
import { PermissionError } from "@/lib/permissions";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

vi.mock("@/lib/gemini", () => ({ generateText: vi.fn() }));
import { generateText } from "@/lib/gemini";

import { openThreadAndMaybeGetCatchUp, getStoredThreadSummary } from "@/app/actions/threadCatchUp";
import { runThreadCatchUp } from "@/lib/threadCatchUp";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("thread catch-up", () => {
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

  // These exercise the actual staleness/regeneration behavior via
  // lib/threadCatchUp.ts's runThreadCatchUp, which takes an explicit `now`
  // so time can be simulated without waiting. This is the testable entry
  // point Finding 2's fix extracted the public Server Action's logic into —
  // the public action itself no longer accepts a caller-supplied clock.
  describe("runThreadCatchUp (lib, explicit now)", () => {
    it("never viewed before: records the view, does not show a catch-up, does not call Gemini", async () => {
      const now = new Date("2026-03-01T00:00:00Z");
      const result = await runThreadCatchUp(threadId, ownerId, now);

      expect(result).toEqual({ showCatchUp: false, summary: null });
      expect(generateText).not.toHaveBeenCalled();

      const view = await db.threadView.findUnique({ where: { threadId_userId: { threadId, userId: ownerId } } });
      expect(view?.lastViewedAt).toEqual(now);
    });

    it("viewed again within 24h: not stale, no catch-up", async () => {
      const firstView = new Date("2026-03-01T00:00:00Z");
      await runThreadCatchUp(threadId, ownerId, firstView);

      const secondView = new Date(firstView.getTime() + 60 * 60 * 1000);
      const result = await runThreadCatchUp(threadId, ownerId, secondView);

      expect(result.showCatchUp).toBe(false);
      expect(generateText).not.toHaveBeenCalled();
    });

    it("stale with no activity and no prior summary: shows a fixed message, no Gemini call", async () => {
      const firstView = new Date("2026-03-01T00:00:00Z");
      await runThreadCatchUp(threadId, ownerId, firstView);

      const staleView = new Date(firstView.getTime() + 25 * 60 * 60 * 1000);
      const result = await runThreadCatchUp(threadId, ownerId, staleView);

      expect(result.showCatchUp).toBe(true);
      expect(result.summary).toBe("Nothing to catch up on yet.");
      expect(generateText).not.toHaveBeenCalled();
    });

    it("stale with new activity and no prior summary: calls Gemini and persists the summary", async () => {
      const firstView = new Date("2026-03-01T00:00:00Z");
      await runThreadCatchUp(threadId, ownerId, firstView);
      await createTask({ primaryThreadId: threadId, title: "Draft summary" });

      vi.mocked(generateText).mockResolvedValue("Ada started drafting the summary.");

      const staleView = new Date(firstView.getTime() + 25 * 60 * 60 * 1000);
      const result = await runThreadCatchUp(threadId, ownerId, staleView);

      expect(result.showCatchUp).toBe(true);
      expect(result.summary).toBe("Ada started drafting the summary.");
      expect(generateText).toHaveBeenCalledTimes(1);

      const stored = await db.threadSummary.findUnique({ where: { threadId } });
      expect(stored?.summaryText).toBe("Ada started drafting the summary.");
      expect(stored?.lastIncludedAt).toEqual(staleView);
    });

    it("stale with an existing summary and no new activity since it: reuses the stored text, no Gemini call", async () => {
      // Anchor on real "now" rather than a fixed past literal: the task's
      // createdAt is set by the real clock (createTask doesn't accept an
      // override), so lastIncludedAt must be computed relative to that same
      // real clock or the "no new activity since the cursor" comparison
      // below is meaningless.
      const firstView = new Date();
      await runThreadCatchUp(threadId, ownerId, firstView);
      await createTask({ primaryThreadId: threadId, title: "Draft summary" });
      vi.mocked(generateText).mockResolvedValue("First summary.");
      const staleView1 = new Date(firstView.getTime() + 25 * 60 * 60 * 1000);
      await runThreadCatchUp(threadId, ownerId, staleView1);

      vi.mocked(generateText).mockReset();
      const staleView2 = new Date(staleView1.getTime() + 25 * 60 * 60 * 1000);
      const result = await runThreadCatchUp(threadId, ownerId, staleView2);

      expect(result.showCatchUp).toBe(true);
      expect(result.summary).toBe("First summary.");
      expect(generateText).not.toHaveBeenCalled();
    });

    it("uses the calling user's preferredAiModel", async () => {
      await db.user.update({ where: { id: ownerId }, data: { preferredAiModel: "gemini-2.5-flash" } });
      // A first view must happen before a stale one is possible — a thread
      // with no ThreadView row yet is never "stale" (see isThreadStale).
      const firstView = new Date();
      await runThreadCatchUp(threadId, ownerId, firstView);
      await createTask({ primaryThreadId: threadId, title: "Task" });
      vi.mocked(generateText).mockResolvedValue("Summary.");

      const staleView = new Date(firstView.getTime() + 25 * 60 * 60 * 1000);
      await runThreadCatchUp(threadId, ownerId, staleView);

      expect(generateText).toHaveBeenCalledWith("gemini-2.5-flash", expect.any(String));
    });

    // Finding 3 regression test: every other test here covers all-new-summary
    // or reuse-with-no-activity, but none of them proved that an EXISTING
    // summary is actually threaded into the prompt on a second regeneration —
    // passing null instead would have made every prior test still pass.
    it("extends an existing summary with new activity: passes the previous summary text into the prompt, and advances lastIncludedAt", async () => {
      const firstView = new Date("2026-03-01T00:00:00Z");
      await runThreadCatchUp(threadId, ownerId, firstView);
      await createTask({ primaryThreadId: threadId, title: "Draft summary" });

      vi.mocked(generateText).mockResolvedValueOnce("First summary.");
      const staleView1 = new Date(firstView.getTime() + 25 * 60 * 60 * 1000);
      const firstResult = await runThreadCatchUp(threadId, ownerId, staleView1);
      expect(firstResult.summary).toBe("First summary.");

      const afterFirst = await db.threadSummary.findUniqueOrThrow({ where: { threadId } });
      expect(afterFirst.lastIncludedAt).toEqual(staleView1);

      const secondTask = await createTask({ primaryThreadId: threadId, title: "Second task" });
      await addTaskUpdate(secondTask.id, "A comment after the first summary.");

      vi.mocked(generateText).mockResolvedValueOnce("Second summary, building on the first.");
      const staleView2 = new Date(staleView1.getTime() + 25 * 60 * 60 * 1000);
      const secondResult = await runThreadCatchUp(threadId, ownerId, staleView2);

      expect(secondResult.summary).toBe("Second summary, building on the first.");
      expect(generateText).toHaveBeenCalledTimes(2);

      const secondCallArgs = vi.mocked(generateText).mock.calls[1];
      const secondCallPrompt = secondCallArgs[1];
      expect(secondCallPrompt).toContain("First summary.");

      const afterSecond = await db.threadSummary.findUniqueOrThrow({ where: { threadId } });
      expect(afterSecond.lastIncludedAt).toEqual(staleView2);
      expect(afterSecond.lastIncludedAt.getTime()).toBeGreaterThan(afterFirst.lastIncludedAt.getTime());
    });

    it("getStoredThreadSummary returns null when none exists, the text when it does, and never touches ThreadView", async () => {
      expect(await getStoredThreadSummary(threadId)).toBeNull();

      const firstView = new Date();
      await runThreadCatchUp(threadId, ownerId, firstView);
      await createTask({ primaryThreadId: threadId, title: "Task" });
      vi.mocked(generateText).mockResolvedValue("Stored summary.");
      const staleView = new Date(firstView.getTime() + 25 * 60 * 60 * 1000);
      await runThreadCatchUp(threadId, ownerId, staleView);

      const before = await db.threadView.findUnique({ where: { threadId_userId: { threadId, userId: ownerId } } });
      const text = await getStoredThreadSummary(threadId);
      const after = await db.threadView.findUnique({ where: { threadId_userId: { threadId, userId: ownerId } } });

      expect(text).toBe("Stored summary.");
      expect(after?.lastViewedAt).toEqual(before?.lastViewedAt);
    });
  });

  // The public, client-callable Server Action: only auth/permissions plus
  // the real clock. No test here may pass a `now` — the whole point of
  // Finding 2's fix is that there is nowhere to pass one.
  describe("openThreadAndMaybeGetCatchUp (public Server Action)", () => {
    it("blocks a stranger with no access", async () => {
      await loginAs(strangerId);
      await expect(openThreadAndMaybeGetCatchUp(threadId)).rejects.toThrow(PermissionError);
    });

    it("never viewed before: does not show a catch-up and does not call Gemini", async () => {
      await loginAs(ownerId);
      const result = await openThreadAndMaybeGetCatchUp(threadId);
      expect(result).toEqual({ showCatchUp: false, summary: null });
      expect(generateText).not.toHaveBeenCalled();
    });

    it("uses the real current time and cannot be manipulated by the caller: a view stamped >24h ago (via direct DB write, since there is no `now` argument to inject) is correctly reported stale, and the recorded lastViewedAt reflects the real clock at call time, not any caller-supplied value", async () => {
      await loginAs(ownerId);
      await db.threadView.create({
        data: { threadId, userId: ownerId, lastViewedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
      });

      const before = Date.now();
      const result = await openThreadAndMaybeGetCatchUp(threadId);
      const after = Date.now();

      expect(result.showCatchUp).toBe(true);
      expect(result.summary).toBe("Nothing to catch up on yet.");

      const view = await db.threadView.findUniqueOrThrow({
        where: { threadId_userId: { threadId, userId: ownerId } },
      });
      expect(view.lastViewedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(view.lastViewedAt.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe("getStoredThreadSummary", () => {
    it("blocks a stranger with no access", async () => {
      await loginAs(strangerId);
      await expect(getStoredThreadSummary(threadId)).rejects.toThrow(PermissionError);
    });
  });
});
