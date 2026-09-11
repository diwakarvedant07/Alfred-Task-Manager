"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  resolveThreadRole,
  canManageThreadMeta,
  canCloseOrDeleteThread,
  PermissionError,
} from "@/lib/permissions";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new PermissionError("You must be logged in.");
  return session.user.id;
}

async function requireRole(threadId: string, userId: string) {
  const thread = await db.thread.findUniqueOrThrow({
    where: { id: threadId },
    include: { shares: true },
  });
  const role = resolveThreadRole({
    ownerId: thread.ownerId,
    shares: thread.shares.map((s) => ({ sharedWithUserId: s.sharedWithUserId, permission: s.permission })),
    userId,
  });
  return { thread, role };
}

export async function createThread(input: { name: string; categoryColor: string }) {
  const userId = await requireUserId();
  return db.thread.create({
    data: { ownerId: userId, name: input.name, categoryColor: input.categoryColor },
  });
}

export async function renameThread(threadId: string, name: string) {
  const userId = await requireUserId();
  const { role } = await requireRole(threadId, userId);
  if (!canManageThreadMeta(role)) throw new PermissionError();
  return db.thread.update({ where: { id: threadId }, data: { name } });
}

export async function changeThreadCategoryColor(threadId: string, categoryColor: string) {
  const userId = await requireUserId();
  const { role } = await requireRole(threadId, userId);
  if (!canManageThreadMeta(role)) throw new PermissionError();
  return db.thread.update({ where: { id: threadId }, data: { categoryColor } });
}

export async function closeThread(threadId: string) {
  const userId = await requireUserId();
  const { role } = await requireRole(threadId, userId);
  if (!canCloseOrDeleteThread(role)) throw new PermissionError();
  return db.thread.update({ where: { id: threadId }, data: { status: "ARCHIVED" } });
}

export async function deleteThread(threadId: string) {
  const userId = await requireUserId();
  const { role } = await requireRole(threadId, userId);
  if (!canCloseOrDeleteThread(role)) throw new PermissionError();
  return db.thread.update({
    where: { id: threadId },
    data: { status: "DELETED", deletedAt: new Date() },
  });
}
