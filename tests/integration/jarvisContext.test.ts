import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { getThreadsForJarvis, findTasksForJarvis } from "@/lib/jarvisContext";

describe("getThreadsForJarvis", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  it("includes the user's own ACTIVE threads, with summary null when none exists", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    const thread = await db.thread.create({
      data: { ownerId: user.id, name: "Q3 Report", categoryColor: "#f2c14e" },
    });

    const result = await getThreadsForJarvis(user.id);

    expect(result).toEqual([{ id: thread.id, name: "Q3 Report", summary: null }]);
  });

  it("includes the thread's summaryText when a ThreadSummary exists", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    const thread = await db.thread.create({
      data: { ownerId: user.id, name: "Q3 Report", categoryColor: "#f2c14e" },
    });
    await db.threadSummary.create({
      data: { threadId: thread.id, summaryText: "Waiting on legal sign-off.", lastIncludedAt: new Date() },
    });

    const result = await getThreadsForJarvis(user.id);

    expect(result).toEqual([{ id: thread.id, name: "Q3 Report", summary: "Waiting on legal sign-off." }]);
  });

  it("includes threads shared with the user, and excludes threads owned/shared with someone else", async () => {
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const other = await db.user.create({ data: { email: "other@x.com", passwordHash: "x", name: "Other" } });
    const sharedThread = await db.thread.create({
      data: { ownerId: owner.id, name: "Shared With Me", categoryColor: "#38e0ff" },
    });
    await db.threadShare.create({
      data: { threadId: sharedThread.id, sharedWithUserId: other.id, permission: "EDITOR" },
    });
    await db.thread.create({
      data: { ownerId: owner.id, name: "Not Shared", categoryColor: "#38e0ff" },
    });

    const result = await getThreadsForJarvis(other.id);

    expect(result).toEqual([{ id: sharedThread.id, name: "Shared With Me", summary: null }]);
  });

  it("excludes ARCHIVED and DELETED threads", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    await db.thread.create({
      data: { ownerId: user.id, name: "Archived", categoryColor: "#38e0ff", status: "ARCHIVED" },
    });
    await db.thread.create({
      data: { ownerId: user.id, name: "Deleted", categoryColor: "#38e0ff", status: "DELETED", deletedAt: new Date() },
    });

    const result = await getThreadsForJarvis(user.id);

    expect(result).toEqual([]);
  });

  it("caps at 10 threads, most-recently-updated first", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    for (let i = 0; i < 12; i++) {
      await db.thread.create({ data: { ownerId: user.id, name: `Thread ${i}`, categoryColor: "#38e0ff" } });
    }

    const result = await getThreadsForJarvis(user.id);

    expect(result).toHaveLength(10);
    expect(result[0].name).toBe("Thread 11");
  });
});

describe("findTasksForJarvis", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  it("matches by title or description, case-insensitively, scoped to the user's own+shared threads", async () => {
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const stranger = await db.user.create({ data: { email: "stranger@x.com", passwordHash: "x", name: "Stranger" } });
    const thread = await db.thread.create({
      data: { ownerId: owner.id, name: "Q3 Report", categoryColor: "#f2c14e" },
    });
    const otherThread = await db.thread.create({
      data: { ownerId: stranger.id, name: "Not Mine", categoryColor: "#38e0ff" },
    });
    const match = await db.task.create({
      data: { primaryThreadId: thread.id, title: "Call the vendor about the invoice" },
    });
    await db.task.create({ data: { primaryThreadId: thread.id, title: "Unrelated task" } });
    await db.task.create({ data: { primaryThreadId: otherThread.id, title: "vendor call for someone else" } });

    const result = await findTasksForJarvis(owner.id, "vendor");

    expect(result).toEqual([{ id: match.id, title: "Call the vendor about the invoice", threadName: "Q3 Report" }]);
  });

  it("excludes DELETED tasks", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    const thread = await db.thread.create({ data: { ownerId: user.id, name: "T", categoryColor: "#38e0ff" } });
    await db.task.create({
      data: { primaryThreadId: thread.id, title: "vendor call", lifecycleStatus: "DELETED", deletedAt: new Date() },
    });

    const result = await findTasksForJarvis(user.id, "vendor");

    expect(result).toEqual([]);
  });

  it("caps at 5 matches", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    const thread = await db.thread.create({ data: { ownerId: user.id, name: "T", categoryColor: "#38e0ff" } });
    for (let i = 0; i < 7; i++) {
      await db.task.create({ data: { primaryThreadId: thread.id, title: `vendor call ${i}` } });
    }

    const result = await findTasksForJarvis(user.id, "vendor");

    expect(result).toHaveLength(5);
  });
});
