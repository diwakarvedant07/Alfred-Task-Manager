import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { createThread, deleteThread } from "@/app/actions/threads";
import { createTask, deleteTask } from "@/app/actions/tasks";
import { listDeletedItems, restoreThread, restoreTask, emptyRecycleBin } from "@/app/actions/recycleBin";

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
});
