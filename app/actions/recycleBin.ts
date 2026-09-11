"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new PermissionError("You must be logged in.");
  return session.user.id;
}

export async function listDeletedItems() {
  const userId = await requireUserId();
  const threads = await db.thread.findMany({ where: { ownerId: userId, status: "DELETED" } });
  const ownedThreadIds = (await db.thread.findMany({ where: { ownerId: userId } })).map((t) => t.id);
  const tasks = await db.task.findMany({
    where: { primaryThreadId: { in: ownedThreadIds }, lifecycleStatus: "DELETED" },
  });
  return { threads, tasks };
}

export async function restoreThread(threadId: string) {
  const userId = await requireUserId();
  const thread = await db.thread.findUniqueOrThrow({ where: { id: threadId } });
  if (thread.ownerId !== userId) throw new PermissionError();
  return db.thread.update({ where: { id: threadId }, data: { status: "ACTIVE", deletedAt: null } });
}

export async function restoreTask(taskId: string) {
  const userId = await requireUserId();
  const task = await db.task.findUniqueOrThrow({ where: { id: taskId }, include: { primaryThread: true } });
  if (task.primaryThread.ownerId !== userId) throw new PermissionError();
  return db.task.update({ where: { id: taskId }, data: { lifecycleStatus: "ACTIVE", deletedAt: null } });
}

export async function emptyRecycleBin() {
  await requireUserId();
  const { threads, tasks } = await listDeletedItems();

  const tasksDeleted = await db.task.deleteMany({ where: { id: { in: tasks.map((t) => t.id) } } });
  const threadsDeleted = await db.thread.deleteMany({ where: { id: { in: threads.map((t) => t.id) } } });

  return { threadsDeleted: threadsDeleted.count, tasksDeleted: tasksDeleted.count };
}
