"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { resolveThreadRole, canViewThread, PermissionError } from "@/lib/permissions";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new PermissionError("You must be logged in.");
  return session.user.id;
}

async function requireViewRole(taskId: string, userId: string) {
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
  if (!canViewThread(role)) throw new PermissionError();
}

export async function saveTaskPosition(taskId: string, positionX: number, positionY: number) {
  const userId = await requireUserId();
  await requireViewRole(taskId, userId);
  return db.taskPosition.upsert({
    where: { taskId_userId: { taskId, userId } },
    create: { taskId, userId, positionX, positionY },
    update: { positionX, positionY },
  });
}

export async function getTaskPositions(taskIds: string[]) {
  const userId = await requireUserId();
  return db.taskPosition.findMany({ where: { taskId: { in: taskIds }, userId } });
}
