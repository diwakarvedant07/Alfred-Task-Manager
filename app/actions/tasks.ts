"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { resolveThreadRole, canManageTasks, PermissionError } from "@/lib/permissions";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new PermissionError("You must be logged in.");
  return session.user.id;
}

async function requireTaskManageRole(threadId: string, userId: string) {
  const thread = await db.thread.findUniqueOrThrow({
    where: { id: threadId },
    include: { shares: true },
  });
  const role = resolveThreadRole({
    ownerId: thread.ownerId,
    shares: thread.shares.map((s) => ({ sharedWithUserId: s.sharedWithUserId, permission: s.permission })),
    userId,
  });
  if (!canManageTasks(role)) throw new PermissionError();
}

export async function createTask(input: {
  primaryThreadId: string;
  title: string;
  description?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH";
  dueDate?: Date;
}) {
  const userId = await requireUserId();
  await requireTaskManageRole(input.primaryThreadId, userId);
  return db.task.create({
    data: {
      primaryThreadId: input.primaryThreadId,
      title: input.title,
      description: input.description ?? "",
      priority: input.priority ?? "MEDIUM",
      dueDate: input.dueDate,
    },
  });
}

async function loadTaskWithThreadRole(taskId: string, userId: string) {
  const task = await db.task.findUniqueOrThrow({ where: { id: taskId } });
  await requireTaskManageRole(task.primaryThreadId, userId);
  return task;
}

export async function updateTask(
  taskId: string,
  patch: {
    title?: string;
    description?: string;
    workStatus?: "TODO" | "IN_PROGRESS" | "DONE";
    priority?: "LOW" | "MEDIUM" | "HIGH";
    dueDate?: Date | null;
  }
) {
  const userId = await requireUserId();
  await loadTaskWithThreadRole(taskId, userId);
  return db.task.update({ where: { id: taskId }, data: patch });
}

export async function moveTaskToThread(taskId: string, newThreadId: string) {
  const userId = await requireUserId();
  await loadTaskWithThreadRole(taskId, userId);
  await requireTaskManageRole(newThreadId, userId);
  return db.task.update({ where: { id: taskId }, data: { primaryThreadId: newThreadId } });
}

export async function linkSecondaryThread(taskId: string, threadId: string) {
  const userId = await requireUserId();
  await loadTaskWithThreadRole(taskId, userId);
  await requireTaskManageRole(threadId, userId);
  await db.taskThreadLink.create({ data: { taskId, threadId } });
}

export async function unlinkSecondaryThread(taskId: string, threadId: string) {
  const userId = await requireUserId();
  await loadTaskWithThreadRole(taskId, userId);
  await db.taskThreadLink.delete({ where: { taskId_threadId: { taskId, threadId } } });
}

export async function deleteTask(taskId: string) {
  const userId = await requireUserId();
  await loadTaskWithThreadRole(taskId, userId);
  return db.task.update({
    where: { id: taskId },
    data: { lifecycleStatus: "DELETED", deletedAt: new Date() },
  });
}
