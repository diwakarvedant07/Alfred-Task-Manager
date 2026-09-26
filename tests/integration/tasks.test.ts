import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { createThread } from "@/app/actions/threads";
import {
  createTask,
  updateTask,
  moveTaskToThread,
  linkSecondaryThread,
  unlinkSecondaryThread,
  deleteTask,
} from "@/app/actions/tasks";
import { PermissionError } from "@/lib/permissions";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("task actions", () => {
  let ownerId: string;
  let viewerId: string;
  let threadId: string;
  let secondThreadId: string;

  beforeEach(async () => {
    await resetDb();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const viewer = await db.user.create({ data: { email: "viewer@x.com", passwordHash: "x", name: "Viewer" } });
    ownerId = owner.id;
    viewerId = viewer.id;

    await loginAs(ownerId);
    const thread = await createThread({ name: "Primary", categoryColor: "#f2c14e" });
    const secondThread = await createThread({ name: "Secondary", categoryColor: "#6fb1e0" });
    threadId = thread.id;
    secondThreadId = secondThread.id;
    await db.threadShare.create({ data: { threadId, sharedWithUserId: viewerId, permission: "VIEWER" } });
  });
  afterAll(async () => db.$disconnect());

  it("creates a task with a required primary thread", async () => {
    await loginAs(ownerId);
    const task = await createTask({ primaryThreadId: threadId, title: "Draft summary" });
    expect(task.primaryThreadId).toBe(threadId);
    expect(task.workStatus).toBe("TODO");
    expect(task.priority).toBe("MEDIUM");
  });

  it("blocks a viewer from creating or editing tasks", async () => {
    await loginAs(ownerId);
    const task = await createTask({ primaryThreadId: threadId, title: "Owner task" });

    await loginAs(viewerId);
    await expect(createTask({ primaryThreadId: threadId, title: "Viewer task" })).rejects.toThrow(PermissionError);
    await expect(updateTask(task.id, { title: "Hacked" })).rejects.toThrow(PermissionError);
  });

  it("moves a task to a different primary thread", async () => {
    await loginAs(ownerId);
    const task = await createTask({ primaryThreadId: threadId, title: "Movable" });
    const moved = await moveTaskToThread(task.id, secondThreadId);
    expect(moved.primaryThreadId).toBe(secondThreadId);
  });

  it("links and unlinks a secondary thread without touching the primary", async () => {
    await loginAs(ownerId);
    const task = await createTask({ primaryThreadId: threadId, title: "Cross-cutting" });
    await linkSecondaryThread(task.id, secondThreadId);

    let links = await db.taskThreadLink.findMany({ where: { taskId: task.id } });
    expect(links.map((l) => l.threadId)).toEqual([secondThreadId]);

    await unlinkSecondaryThread(task.id, secondThreadId);
    links = await db.taskThreadLink.findMany({ where: { taskId: task.id } });
    expect(links).toHaveLength(0);
  });

  it("soft-deletes a task", async () => {
    await loginAs(ownerId);
    const task = await createTask({ primaryThreadId: threadId, title: "Doomed" });
    const deleted = await deleteTask(task.id);
    expect(deleted.lifecycleStatus).toBe("DELETED");
    expect(deleted.deletedAt).not.toBeNull();
  });

  it("gives each new task in the same thread a distinct initial position, instead of stacking them all at the origin", async () => {
    await loginAs(ownerId);
    const first = await createTask({ primaryThreadId: threadId, title: "First" });
    const second = await createTask({ primaryThreadId: threadId, title: "Second" });
    const third = await createTask({ primaryThreadId: threadId, title: "Third" });

    const positions = await db.taskPosition.findMany({
      where: { taskId: { in: [first.id, second.id, third.id] }, userId: ownerId },
    });
    expect(positions).toHaveLength(3);

    const distinctPositions = new Set(positions.map((p) => `${p.positionX},${p.positionY}`));
    expect(distinctPositions.size).toBe(3);

    // Not every task should default to the canvas origin, which is what
    // caused every new card (and every BUBBLE-tier thread centroid derived
    // from them) to render stacked on top of each other.
    expect(positions.some((p) => p.positionX !== 0 || p.positionY !== 0)).toBe(true);
  });

  it("gives the first task of a new thread a different position than the first task of an earlier thread", async () => {
    // Before computeInitialThreadOffset, every thread's first task started
    // at the same {0, 0} local origin, so two different threads' bubbles
    // (and their sole starting cards) rendered stacked on top of each
    // other -- this is what a user sees as "every new thread I create
    // piles up in the same spot".
    await loginAs(ownerId);
    const firstTaskOfThreadOne = await createTask({ primaryThreadId: threadId, title: "Thread one's first task" });
    const firstTaskOfThreadTwo = await createTask({
      primaryThreadId: secondThreadId,
      title: "Thread two's first task",
    });

    const [posOne, posTwo] = await Promise.all([
      db.taskPosition.findUniqueOrThrow({ where: { taskId_userId: { taskId: firstTaskOfThreadOne.id, userId: ownerId } } }),
      db.taskPosition.findUniqueOrThrow({ where: { taskId_userId: { taskId: firstTaskOfThreadTwo.id, userId: ownerId } } }),
    ]);

    expect(posOne.positionX !== posTwo.positionX || posOne.positionY !== posTwo.positionY).toBe(true);
  });
});
