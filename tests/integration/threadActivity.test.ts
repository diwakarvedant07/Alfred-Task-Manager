import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { hasNewThreadActivity, getNewThreadActivity } from "@/lib/threadActivity";

describe("thread activity queries", () => {
  let threadId: string;
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "Ada" } });
    const thread = await db.thread.create({
      data: { ownerId: user.id, name: "Q3 Report", categoryColor: "#f2c14e" },
    });
    userId = user.id;
    threadId = thread.id;
  });
  afterAll(async () => db.$disconnect());

  it("with since=null: reports activity exists when any task exists, and marks it as new", async () => {
    const task = await db.task.create({
      data: { primaryThreadId: threadId, title: "Draft summary" },
    });

    expect(await hasNewThreadActivity(threadId, null)).toBe(true);

    const activity = await getNewThreadActivity(threadId, null);
    expect(activity.tasks).toHaveLength(1);
    expect(activity.tasks[0]).toMatchObject({ id: task.id, title: "Draft summary", isNew: true });
  });

  it("with since=null: reports no activity for a thread with zero tasks and zero comments", async () => {
    expect(await hasNewThreadActivity(threadId, null)).toBe(false);
    const activity = await getNewThreadActivity(threadId, null);
    expect(activity.tasks).toHaveLength(0);
    expect(activity.updates).toHaveLength(0);
  });

  it("with a cursor: only counts tasks/comments newer than the cursor", async () => {
    const oldTask = await db.task.create({
      data: { primaryThreadId: threadId, title: "Old task" },
    });
    await new Promise((r) => setTimeout(r, 20));
    const cursor = new Date();
    await new Promise((r) => setTimeout(r, 20));
    const newTask = await db.task.create({
      data: { primaryThreadId: threadId, title: "New task" },
    });

    expect(await hasNewThreadActivity(threadId, cursor)).toBe(true);

    const activity = await getNewThreadActivity(threadId, cursor);
    expect(activity.tasks.map((t) => t.id)).toEqual([newTask.id]);
    expect(activity.tasks[0].isNew).toBe(true);
    void oldTask;
  });

  it("with a cursor: an updated (not newly created) task is included and marked not new", async () => {
    const task = await db.task.create({
      data: { primaryThreadId: threadId, title: "Task" },
    });
    await new Promise((r) => setTimeout(r, 20));
    const cursor = new Date();
    await new Promise((r) => setTimeout(r, 20));
    await db.task.update({ where: { id: task.id }, data: { workStatus: "DONE" } });

    const activity = await getNewThreadActivity(threadId, cursor);
    expect(activity.tasks).toHaveLength(1);
    expect(activity.tasks[0]).toMatchObject({ id: task.id, workStatus: "DONE", isNew: false });
  });

  it("with a cursor: includes new comments with author name and task title", async () => {
    const task = await db.task.create({
      data: { primaryThreadId: threadId, title: "Draft summary" },
    });
    await new Promise((r) => setTimeout(r, 20));
    const cursor = new Date();
    await new Promise((r) => setTimeout(r, 20));
    await db.taskUpdate.create({
      data: { taskId: task.id, authorId: userId, body: "Pulled the numbers." },
    });

    expect(await hasNewThreadActivity(threadId, cursor)).toBe(true);

    const activity = await getNewThreadActivity(threadId, cursor);
    expect(activity.updates).toHaveLength(1);
    expect(activity.updates[0]).toMatchObject({
      taskTitle: "Draft summary",
      authorName: "Ada",
      body: "Pulled the numbers.",
    });
  });

  it("with a cursor and no new activity, reports false and empty arrays", async () => {
    await db.task.create({ data: { primaryThreadId: threadId, title: "Old task" } });
    const cursor = new Date(Date.now() + 60_000);

    expect(await hasNewThreadActivity(threadId, cursor)).toBe(false);
    const activity = await getNewThreadActivity(threadId, cursor);
    expect(activity.tasks).toHaveLength(0);
    expect(activity.updates).toHaveLength(0);
  });
});
