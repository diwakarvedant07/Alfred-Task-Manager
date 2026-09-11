import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import {
  createThread,
  renameThread,
  changeThreadCategoryColor,
  closeThread,
  deleteThread,
} from "@/app/actions/threads";
import { createTask, deleteTask } from "@/app/actions/tasks";
import { PermissionError } from "@/lib/permissions";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("thread actions", () => {
  let ownerId: string;
  let editorId: string;
  let viewerId: string;
  let strangerId: string;

  beforeEach(async () => {
    await resetDb();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const editor = await db.user.create({ data: { email: "editor@x.com", passwordHash: "x", name: "Editor" } });
    const viewer = await db.user.create({ data: { email: "viewer@x.com", passwordHash: "x", name: "Viewer" } });
    const stranger = await db.user.create({ data: { email: "stranger@x.com", passwordHash: "x", name: "Stranger" } });
    ownerId = owner.id;
    editorId = editor.id;
    viewerId = viewer.id;
    strangerId = stranger.id;
  });
  afterAll(async () => db.$disconnect());

  it("creates a thread owned by the caller", async () => {
    await loginAs(ownerId);
    const thread = await createThread({ name: "Q3 Report", categoryColor: "#f2c14e" });
    expect(thread.ownerId).toBe(ownerId);
    expect(thread.status).toBe("ACTIVE");
  });

  it("lets the owner and an editor rename and recolor a thread", async () => {
    await loginAs(ownerId);
    const thread = await createThread({ name: "Original", categoryColor: "#f2c14e" });
    await db.threadShare.create({
      data: { threadId: thread.id, sharedWithUserId: editorId, permission: "EDITOR" },
    });

    await loginAs(editorId);
    const renamed = await renameThread(thread.id, "Renamed by editor");
    expect(renamed.name).toBe("Renamed by editor");

    const recolored = await changeThreadCategoryColor(thread.id, "#38e0ff");
    expect(recolored.categoryColor).toBe("#38e0ff");
  });

  it("blocks a viewer from renaming a thread", async () => {
    await loginAs(ownerId);
    const thread = await createThread({ name: "Original", categoryColor: "#f2c14e" });
    await db.threadShare.create({
      data: { threadId: thread.id, sharedWithUserId: viewerId, permission: "VIEWER" },
    });

    await loginAs(viewerId);
    await expect(renameThread(thread.id, "Nope")).rejects.toThrow(PermissionError);
  });

  it("only lets the owner close or delete a thread, not an editor", async () => {
    await loginAs(ownerId);
    const thread = await createThread({ name: "Original", categoryColor: "#f2c14e" });
    await db.threadShare.create({
      data: { threadId: thread.id, sharedWithUserId: editorId, permission: "EDITOR" },
    });

    await loginAs(editorId);
    await expect(closeThread(thread.id)).rejects.toThrow(PermissionError);
    await expect(deleteThread(thread.id)).rejects.toThrow(PermissionError);

    await loginAs(ownerId);
    const closed = await closeThread(thread.id);
    expect(closed.status).toBe("ARCHIVED");
    const deleted = await deleteThread(thread.id);
    expect(deleted.status).toBe("DELETED");
    expect(deleted.deletedAt).not.toBeNull();
  });

  it("blocks a stranger with no share record entirely", async () => {
    await loginAs(ownerId);
    const thread = await createThread({ name: "Private", categoryColor: "#f2c14e" });

    await loginAs(strangerId);
    await expect(renameThread(thread.id, "Nope")).rejects.toThrow(PermissionError);
  });

  it("cascades a thread's soft-delete onto its still-active tasks, but leaves an already-deleted task's own deletion alone", async () => {
    await loginAs(ownerId);
    const thread = await createThread({ name: "Thread with tasks", categoryColor: "#f2c14e" });
    const activeTask = await createTask({ primaryThreadId: thread.id, title: "Was active" });
    const alreadyDeletedTask = await createTask({ primaryThreadId: thread.id, title: "Already gone" });
    await deleteTask(alreadyDeletedTask.id);
    const alreadyDeletedBefore = await db.task.findUniqueOrThrow({ where: { id: alreadyDeletedTask.id } });

    await deleteThread(thread.id);

    const cascaded = await db.task.findUniqueOrThrow({ where: { id: activeTask.id } });
    expect(cascaded.lifecycleStatus).toBe("DELETED");
    expect(cascaded.deletedAt).not.toBeNull();
    expect(cascaded.deletedByThreadCascade).toBe(true);

    // The task that was already deleted on its own before the thread was
    // deleted keeps its original deletion record untouched.
    const stillIndependentlyDeleted = await db.task.findUniqueOrThrow({ where: { id: alreadyDeletedTask.id } });
    expect(stillIndependentlyDeleted.lifecycleStatus).toBe("DELETED");
    expect(stillIndependentlyDeleted.deletedByThreadCascade).toBe(false);
    expect(stillIndependentlyDeleted.deletedAt?.getTime()).toBe(alreadyDeletedBefore.deletedAt?.getTime());
  });
});
