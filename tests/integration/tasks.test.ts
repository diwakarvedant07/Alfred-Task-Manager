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
});
