import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { getCalibrationThreadSummaries } from "@/lib/threadCalibration";

describe("getCalibrationThreadSummaries", () => {
  let ownerId: string;
  let collaboratorId: string;

  beforeEach(async () => {
    await resetDb();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const collaborator = await db.user.create({ data: { email: "collab@x.com", passwordHash: "x", name: "Collab" } });
    ownerId = owner.id;
    collaboratorId = collaborator.id;
  });
  afterAll(async () => db.$disconnect());

  it("excludes the given thread and threads with no summary", async () => {
    const excluded = await db.thread.create({ data: { ownerId, name: "Excluded", categoryColor: "#f2c14e" } });
    await db.threadSummary.create({ data: { threadId: excluded.id, summaryText: "Should not appear.", lastIncludedAt: new Date() } });

    const noSummary = await db.thread.create({ data: { ownerId, name: "No Summary Yet", categoryColor: "#38e0ff" } });
    void noSummary;

    const withSummary = await db.thread.create({ data: { ownerId, name: "Client Launch", categoryColor: "#ff5fa8" } });
    await db.threadSummary.create({ data: { threadId: withSummary.id, summaryText: "Waiting on legal sign-off.", lastIncludedAt: new Date() } });

    const results = await getCalibrationThreadSummaries(ownerId, excluded.id);

    expect(results).toEqual([{ name: "Client Launch", summary: "Waiting on legal sign-off." }]);
  });

  it("includes threads shared with the user, not just owned ones", async () => {
    const ownedThread = await db.thread.create({ data: { ownerId, name: "Mine", categoryColor: "#f2c14e" } });
    void ownedThread;
    const sharedThread = await db.thread.create({ data: { ownerId, name: "Shared With Me", categoryColor: "#38e0ff" } });
    await db.threadShare.create({ data: { threadId: sharedThread.id, sharedWithUserId: collaboratorId, permission: "VIEWER" } });
    await db.threadSummary.create({ data: { threadId: sharedThread.id, summaryText: "Shared thread summary.", lastIncludedAt: new Date() } });

    const results = await getCalibrationThreadSummaries(collaboratorId, "some-other-thread-id");

    expect(results).toEqual([{ name: "Shared With Me", summary: "Shared thread summary." }]);
  });

  it("excludes ARCHIVED and DELETED threads", async () => {
    const archived = await db.thread.create({ data: { ownerId, name: "Archived", categoryColor: "#f2c14e", status: "ARCHIVED" } });
    await db.threadSummary.create({ data: { threadId: archived.id, summaryText: "Archived summary.", lastIncludedAt: new Date() } });

    const results = await getCalibrationThreadSummaries(ownerId, "some-other-thread-id");

    expect(results).toEqual([]);
  });

  it("orders by most-recently-updated summary first and caps at 10", async () => {
    for (let i = 0; i < 12; i++) {
      const thread = await db.thread.create({ data: { ownerId, name: `Thread ${i}`, categoryColor: "#f2c14e" } });
      await db.threadSummary.create({ data: { threadId: thread.id, summaryText: `Summary ${i}`, lastIncludedAt: new Date() } });
      await new Promise((r) => setTimeout(r, 5));
    }

    const results = await getCalibrationThreadSummaries(ownerId, "some-other-thread-id");

    expect(results).toHaveLength(10);
    expect(results[0].name).toBe("Thread 11");
    expect(results[9].name).toBe("Thread 2");
  });
});
