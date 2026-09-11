"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { resolveThreadRole, canComment, PermissionError } from "@/lib/permissions";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new PermissionError("You must be logged in.");
  return session.user.id;
}

async function requireCommentRole(taskId: string, userId: string) {
  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { primaryThread: { include: { shares: true } } },
  });
  const role = resolveThreadRole({
    ownerId: task.primaryThread.ownerId,
    shares: task.primaryThread.shares.map((s) => ({
      sharedWithUserId: s.sharedWithUserId,
      permission: s.permission,
    })),
    userId,
  });
  if (!canComment(role)) throw new PermissionError();
}

export async function addTaskUpdate(taskId: string, body: string) {
  const userId = await requireUserId();
  await requireCommentRole(taskId, userId);
  return db.taskUpdate.create({ data: { taskId, authorId: userId, body } });
}

export async function listTaskUpdates(taskId: string) {
  const userId = await requireUserId();
  await requireCommentRole(taskId, userId);
  return db.taskUpdate.findMany({ where: { taskId }, orderBy: { createdAt: "asc" } });
}
