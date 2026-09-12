import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { createThread } from "@/app/actions/threads";
import { createTask, updateTask } from "@/app/actions/tasks";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("updateTask clears priorityIsAiSuggested", () => {
  let ownerId: string;
  let taskId: string;

  beforeEach(async () => {
    await resetDb();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    ownerId = owner.id;
    await loginAs(ownerId);
    const thread = await createThread({ name: "Thread", categoryColor: "#f2c14e" });
    const task = await createTask({ primaryThreadId: thread.id, title: "Task" });
    await db.task.update({ where: { id: task.id }, data: { priorityIsAiSuggested: true } });
    taskId = task.id;
  });
  afterAll(async () => db.$disconnect());

  it("clears the flag when priority is included in the patch, even to the same value", async () => {
    await loginAs(ownerId);
    const before = await db.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(before.priorityIsAiSuggested).toBe(true);

    const updated = await updateTask(taskId, { priority: before.priority });

    expect(updated.priorityIsAiSuggested).toBe(false);
  });

  it("leaves the flag untouched when priority is not part of the patch", async () => {
    await loginAs(ownerId);

    const updated = await updateTask(taskId, { title: "Renamed" });

    expect(updated.priorityIsAiSuggested).toBe(true);
  });
});
