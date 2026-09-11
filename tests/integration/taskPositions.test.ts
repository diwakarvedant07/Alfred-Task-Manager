import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { createThread } from "@/app/actions/threads";
import { createTask } from "@/app/actions/tasks";
import { saveTaskPosition, getTaskPositions } from "@/app/actions/taskPositions";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("task positions", () => {
  let ownerId: string;
  let viewerId: string;
  let taskId: string;

  beforeEach(async () => {
    await resetDb();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const viewer = await db.user.create({ data: { email: "viewer@x.com", passwordHash: "x", name: "Viewer" } });
    ownerId = owner.id;
    viewerId = viewer.id;

    await loginAs(ownerId);
    const thread = await createThread({ name: "Primary", categoryColor: "#f2c14e" });
    await db.threadShare.create({ data: { threadId: thread.id, sharedWithUserId: viewerId, permission: "VIEWER" } });
    const task = await createTask({ primaryThreadId: thread.id, title: "Shared task" });
    taskId = task.id;
  });
  afterAll(async () => db.$disconnect());

  it("stores position independently per viewer for the same shared task", async () => {
    await loginAs(ownerId);
    await saveTaskPosition(taskId, 100, 200);

    await loginAs(viewerId);
    await saveTaskPosition(taskId, 500, 600);

    const ownerPositions = await db.taskPosition.findMany({ where: { userId: ownerId } });
    const viewerPositions = await db.taskPosition.findMany({ where: { userId: viewerId } });

    expect(ownerPositions[0]).toMatchObject({ positionX: 100, positionY: 200 });
    expect(viewerPositions[0]).toMatchObject({ positionX: 500, positionY: 600 });
  });

  it("upserts on repeated saves rather than creating duplicates", async () => {
    await loginAs(ownerId);
    await saveTaskPosition(taskId, 1, 1);
    await saveTaskPosition(taskId, 2, 2);

    const positions = await db.taskPosition.findMany({ where: { userId: ownerId, taskId } });
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({ positionX: 2, positionY: 2 });
  });

  it("returns only the current viewer's positions from getTaskPositions", async () => {
    await loginAs(ownerId);
    await saveTaskPosition(taskId, 10, 10);
    await loginAs(viewerId);
    await saveTaskPosition(taskId, 20, 20);

    const positions = await getTaskPositions([taskId]);
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({ userId: viewerId, positionX: 20, positionY: 20 });
  });
});
