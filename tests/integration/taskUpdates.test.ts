import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { createThread } from "@/app/actions/threads";
import { createTask } from "@/app/actions/tasks";
import { addTaskUpdate, listTaskUpdates } from "@/app/actions/taskUpdates";
import { PermissionError } from "@/lib/permissions";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("task update comments", () => {
  let ownerId: string;
  let viewerId: string;
  let strangerId: string;
  let taskId: string;

  beforeEach(async () => {
    await resetDb();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const viewer = await db.user.create({ data: { email: "viewer@x.com", passwordHash: "x", name: "Viewer" } });
    const stranger = await db.user.create({ data: { email: "stranger@x.com", passwordHash: "x", name: "Stranger" } });
    ownerId = owner.id;
    viewerId = viewer.id;
    strangerId = stranger.id;

    await loginAs(ownerId);
    const thread = await createThread({ name: "Primary", categoryColor: "#f2c14e" });
    await db.threadShare.create({ data: { threadId: thread.id, sharedWithUserId: viewerId, permission: "VIEWER" } });
    const task = await createTask({ primaryThreadId: thread.id, title: "Draft summary" });
    taskId = task.id;
  });
  afterAll(async () => db.$disconnect());

  it("lets a viewer add a comment even though they can't edit the task", async () => {
    await loginAs(viewerId);
    const update = await addTaskUpdate(taskId, "Started digging into the numbers.");
    expect(update.body).toBe("Started digging into the numbers.");
    expect(update.authorId).toBe(viewerId);
  });

  it("blocks a stranger with no access from commenting", async () => {
    await loginAs(strangerId);
    await expect(addTaskUpdate(taskId, "Sneaky")).rejects.toThrow(PermissionError);
  });

  it("lists comments oldest to newest", async () => {
    await loginAs(ownerId);
    await addTaskUpdate(taskId, "First");
    await addTaskUpdate(taskId, "Second");

    const updates = await listTaskUpdates(taskId);
    expect(updates.map((u) => u.body)).toEqual(["First", "Second"]);
  });
});
