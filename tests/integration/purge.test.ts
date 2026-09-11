import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { purgeExpiredItems, PURGE_THRESHOLD_DAYS } from "@/lib/purge";

describe("purgeExpiredItems", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  const now = new Date("2026-03-01T00:00:00Z");
  const oldDate = new Date(now.getTime() - (PURGE_THRESHOLD_DAYS + 1) * 24 * 60 * 60 * 1000);
  const recentDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

  it("hard-deletes tasks past the 30-day threshold across all users, keeps recent ones", async () => {
    const ownerA = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    const ownerB = await db.user.create({ data: { email: "b@x.com", passwordHash: "x", name: "B" } });
    const threadA = await db.thread.create({ data: { ownerId: ownerA.id, name: "TA", categoryColor: "#fff" } });
    const threadB = await db.thread.create({ data: { ownerId: ownerB.id, name: "TB", categoryColor: "#fff" } });

    const oldTaskA = await db.task.create({
      data: { primaryThreadId: threadA.id, title: "Old A", lifecycleStatus: "DELETED", deletedAt: oldDate },
    });
    const recentTaskB = await db.task.create({
      data: { primaryThreadId: threadB.id, title: "Recent B", lifecycleStatus: "DELETED", deletedAt: recentDate },
    });

    const result = await purgeExpiredItems(now);
    expect(result.tasksDeleted).toBe(1);

    expect(await db.task.findUnique({ where: { id: oldTaskA.id } })).toBeNull();
    expect(await db.task.findUnique({ where: { id: recentTaskB.id } })).not.toBeNull();
  });

  it("hard-deletes threads past the 30-day threshold and reports threadsDeleted", async () => {
    const owner = await db.user.create({ data: { email: "o@x.com", passwordHash: "x", name: "O" } });
    const oldThread = await db.thread.create({
      data: { ownerId: owner.id, name: "Old thread", categoryColor: "#fff", status: "DELETED", deletedAt: oldDate },
    });
    const recentThread = await db.thread.create({
      data: {
        ownerId: owner.id,
        name: "Recent thread",
        categoryColor: "#fff",
        status: "DELETED",
        deletedAt: recentDate,
      },
    });

    const result = await purgeExpiredItems(now);
    expect(result.threadsDeleted).toBe(1);

    expect(await db.thread.findUnique({ where: { id: oldThread.id } })).toBeNull();
    expect(await db.thread.findUnique({ where: { id: recentThread.id } })).not.toBeNull();
  });

  it("purges an expired task that has a comment (TaskUpdate) without throwing an FK violation", async () => {
    const owner = await db.user.create({ data: { email: "c@x.com", passwordHash: "x", name: "C" } });
    const thread = await db.thread.create({ data: { ownerId: owner.id, name: "Thread", categoryColor: "#fff" } });
    const task = await db.task.create({
      data: { primaryThreadId: thread.id, title: "Commented", lifecycleStatus: "DELETED", deletedAt: oldDate },
    });
    await db.taskUpdate.create({ data: { taskId: task.id, authorId: owner.id, body: "a comment" } });

    const result = await purgeExpiredItems(now);
    expect(result.tasksDeleted).toBe(1);

    expect(await db.task.findUnique({ where: { id: task.id } })).toBeNull();
    expect(await db.taskUpdate.findMany({ where: { taskId: task.id } })).toHaveLength(0);
  });

  it("does not hard-delete an expired thread that still has an active task, and does not throw", async () => {
    const owner = await db.user.create({ data: { email: "d@x.com", passwordHash: "x", name: "D" } });
    const thread = await db.thread.create({
      data: {
        ownerId: owner.id,
        name: "Blocked thread",
        categoryColor: "#fff",
        status: "DELETED",
        deletedAt: oldDate,
      },
    });
    await db.task.create({ data: { primaryThreadId: thread.id, title: "Still active" } });

    const result = await purgeExpiredItems(now);
    expect(result.threadsDeleted).toBe(0);

    const stillThere = await db.thread.findUnique({ where: { id: thread.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.status).toBe("DELETED");
  });

  it("is a no-op when nothing is past the threshold", async () => {
    const owner = await db.user.create({ data: { email: "e@x.com", passwordHash: "x", name: "E" } });
    const thread = await db.thread.create({ data: { ownerId: owner.id, name: "Thread", categoryColor: "#fff" } });
    await db.task.create({
      data: { primaryThreadId: thread.id, title: "Recent", lifecycleStatus: "DELETED", deletedAt: recentDate },
    });

    const result = await purgeExpiredItems(now);
    expect(result).toEqual({ threadsDeleted: 0, tasksDeleted: 0 });
  });
});
