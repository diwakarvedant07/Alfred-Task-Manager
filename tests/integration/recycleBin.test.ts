import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { createThread, deleteThread } from "@/app/actions/threads";
import { createTask, deleteTask } from "@/app/actions/tasks";
import { addTaskUpdate } from "@/app/actions/taskUpdates";
import {
  listDeletedItems,
  restoreThread,
  restoreTask,
  emptyRecycleBin,
  RestoreBlockedError,
} from "@/app/actions/recycleBin";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("recycle bin", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    ownerId = owner.id;
    await loginAs(ownerId);
  });
  afterAll(async () => db.$disconnect());

  it("lists only the current user's deleted threads and tasks", async () => {
    const thread = await createThread({ name: "Doomed thread", categoryColor: "#f2c14e" });
    const task = await createTask({ primaryThreadId: thread.id, title: "Doomed task" });
    await deleteTask(task.id);

    const otherThread = await createThread({ name: "Kept thread", categoryColor: "#38e0ff" });
    await createTask({ primaryThreadId: otherThread.id, title: "Kept task" });

    const { threads, tasks } = await listDeletedItems();
    expect(threads).toHaveLength(0);
    expect(tasks.map((t) => t.title)).toEqual(["Doomed task"]);

    await deleteThread(thread.id);
    const afterThreadDelete = await listDeletedItems();
    expect(afterThreadDelete.threads.map((t) => t.name)).toEqual(["Doomed thread"]);
  });

  it("restores a deleted task back to ACTIVE", async () => {
    const thread = await createThread({ name: "Thread", categoryColor: "#f2c14e" });
    const task = await createTask({ primaryThreadId: thread.id, title: "Restorable" });
    await deleteTask(task.id);

    const restored = await restoreTask(task.id);
    expect(restored.lifecycleStatus).toBe("ACTIVE");
    expect(restored.deletedAt).toBeNull();
  });

  it("restores a deleted thread back to ACTIVE", async () => {
    const thread = await createThread({ name: "Thread", categoryColor: "#f2c14e" });
    await deleteThread(thread.id);

    const restored = await restoreThread(thread.id);
    expect(restored.status).toBe("ACTIVE");
    expect(restored.deletedAt).toBeNull();
  });

  it("empties the recycle bin, hard-deleting everything currently marked deleted", async () => {
    const thread = await createThread({ name: "Thread", categoryColor: "#f2c14e" });
    const task = await createTask({ primaryThreadId: thread.id, title: "Task" });
    await deleteTask(task.id);

    const result = await emptyRecycleBin();
    expect(result.tasksDeleted).toBe(1);

    const found = await db.task.findUnique({ where: { id: task.id } });
    expect(found).toBeNull();
  });

  it("empties a deleted task that has a comment (TaskUpdate) without throwing", async () => {
    const thread = await createThread({ name: "Thread", categoryColor: "#f2c14e" });
    const task = await createTask({ primaryThreadId: thread.id, title: "Commented task" });
    await addTaskUpdate(task.id, "a comment");
    await deleteTask(task.id);

    const result = await emptyRecycleBin();
    expect(result.tasksDeleted).toBe(1);

    const found = await db.task.findUnique({ where: { id: task.id } });
    expect(found).toBeNull();
    const updates = await db.taskUpdate.findMany({ where: { taskId: task.id } });
    expect(updates).toHaveLength(0);
  });

  it("cascades: deleting a thread with an active task moves both into the recycle bin, and Empty Recycle Bin purges both instead of skipping the thread", async () => {
    const thread = await createThread({ name: "Thread with a survivor", categoryColor: "#f2c14e" });
    const task = await createTask({ primaryThreadId: thread.id, title: "Still active" });

    await deleteThread(thread.id);

    // Both the thread and the task it took down with it should be visible
    // in the recycle bin — previously the task kept lifecycleStatus ACTIVE
    // and was unreachable: filtered off the canvas (its thread isn't
    // ACTIVE) but absent from the bin (not DELETED).
    const afterDelete = await listDeletedItems();
    expect(afterDelete.threads.map((t) => t.id)).toContain(thread.id);
    expect(afterDelete.tasks.map((t) => t.id)).toContain(task.id);

    // Previously emptyRecycleBin's defensive "skip a thread with a
    // remaining non-deleted task" check treated this as unpurgeable forever
    // (the task never actually became DELETED), so threadsDeleted stayed 0
    // and "Empty Recycle Bin" silently left the thread behind on every call.
    const result = await emptyRecycleBin();
    expect(result.threadsDeleted).toBe(1);
    expect(result.tasksDeleted).toBe(1);

    expect(await db.thread.findUnique({ where: { id: thread.id } })).toBeNull();
    expect(await db.task.findUnique({ where: { id: task.id } })).toBeNull();
  });

  it("restoring a deleted thread also restores the task that was cascade-deleted with it", async () => {
    const thread = await createThread({ name: "Thread with a survivor", categoryColor: "#f2c14e" });
    const task = await createTask({ primaryThreadId: thread.id, title: "Still active" });

    await deleteThread(thread.id);
    const restored = await restoreThread(thread.id);

    expect(restored.status).toBe("ACTIVE");
    const restoredTask = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(restoredTask.lifecycleStatus).toBe("ACTIVE");
    expect(restoredTask.deletedAt).toBeNull();
    expect(restoredTask.deletedByThreadCascade).toBe(false);
  });

  it("restoring a thread does not resurrect a task that was already independently deleted before the thread was", async () => {
    const thread = await createThread({ name: "Thread", categoryColor: "#f2c14e" });
    const survivorTask = await createTask({ primaryThreadId: thread.id, title: "Cascaded" });
    const priorTask = await createTask({ primaryThreadId: thread.id, title: "Deleted on its own" });
    await deleteTask(priorTask.id);

    await deleteThread(thread.id);
    await restoreThread(thread.id);

    const restoredSurvivor = await db.task.findUniqueOrThrow({ where: { id: survivorTask.id } });
    expect(restoredSurvivor.lifecycleStatus).toBe("ACTIVE");

    const stillDeletedPriorTask = await db.task.findUniqueOrThrow({ where: { id: priorTask.id } });
    expect(stillDeletedPriorTask.lifecycleStatus).toBe("DELETED");
  });

  it("refuses to independently restore a cascade-deleted task while its thread is still deleted, instead of reopening the unreachable-task bug", async () => {
    // Deleting a thread with an active task correctly cascades the task
    // into DELETED too, so it's now listed in the recycle bin alongside
    // the thread with its own independent "Restore" affordance. Clicking
    // that instead of the thread's — restoreTask(taskId), not
    // restoreThread(threadId) — used to flip the task back to ACTIVE while
    // leaving the thread DELETED: the task would vanish from the canvas
    // (thread not ACTIVE), vanish from the recycle bin (task not DELETED),
    // and permanently block the thread from emptyRecycleBin /
    // purgeExpiredItems (their "thread still has a non-deleted task" skip
    // condition would match it forever) — the identical failure mode the
    // cascade fix was meant to eliminate, reached from the opposite
    // direction.
    const thread = await createThread({ name: "Thread with a survivor", categoryColor: "#f2c14e" });
    const task = await createTask({ primaryThreadId: thread.id, title: "Still active" });
    await deleteThread(thread.id);

    await expect(restoreTask(task.id)).rejects.toThrow(RestoreBlockedError);

    // Neither side moved: the task is still DELETED (still reachable via
    // the bin) and the thread is still DELETED (still purgeable once its
    // tasks are dealt with) — not the broken ACTIVE-task-under-a-DELETED-
    // thread state.
    const stillDeletedTask = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stillDeletedTask.lifecycleStatus).toBe("DELETED");
    const stillDeletedThread = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(stillDeletedThread.status).toBe("DELETED");
  });

  it("empties a deleted thread that has a ThreadView and a ThreadSummary without throwing an FK violation", async () => {
    // Finding 1 regression test: ThreadView/ThreadSummary both carry a
    // required (RESTRICT) FK into Thread. openThreadAndMaybeGetCatchUp
    // upserts a ThreadView on every thread-bubble click, so essentially any
    // thread a user has opened has one — emptyRecycleBin used to hard-delete
    // the thread without clearing these first, throwing and rolling back the
    // whole purge (even the tasks that would otherwise be fine).
    const thread = await createThread({ name: "Viewed thread", categoryColor: "#f2c14e" });
    await db.threadView.create({
      data: { threadId: thread.id, userId: ownerId, lastViewedAt: new Date() },
    });
    await db.threadSummary.create({
      data: { threadId: thread.id, summaryText: "Summary.", lastIncludedAt: new Date() },
    });

    await deleteThread(thread.id);
    const result = await emptyRecycleBin();

    expect(result.threadsDeleted).toBe(1);
    expect(await db.thread.findUnique({ where: { id: thread.id } })).toBeNull();
    expect(await db.threadView.findMany({ where: { threadId: thread.id } })).toHaveLength(0);
    expect(await db.threadSummary.findUnique({ where: { threadId: thread.id } })).toBeNull();
  });

  it("defense-in-depth: does not hard-delete a thread with a remaining active task even if that invariant is violated by a direct DB write, and does not throw", async () => {
    // deleteThread always cascades, so this state (a DELETED thread with a
    // still-ACTIVE task) shouldn't arise through the action layer. This
    // test bypasses it with a direct DB write to confirm the emptyRecycleBin
    // skip-logic is still in place as a safety net against that invariant
    // ever being violated some other way.
    const thread = await createThread({ name: "Thread", categoryColor: "#f2c14e" });
    await db.thread.update({ where: { id: thread.id }, data: { status: "DELETED", deletedAt: new Date() } });
    await createTask({ primaryThreadId: thread.id, title: "Still active" });

    const result = await emptyRecycleBin();
    expect(result.threadsDeleted).toBe(0);

    const stillThere = await db.thread.findUnique({ where: { id: thread.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.status).toBe("DELETED");
  });
});
