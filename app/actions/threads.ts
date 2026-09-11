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

  // Soft-deleting a thread must take its still-active tasks down with it in
  // the same operation. Without this, a deleted thread's tasks keep
  // lifecycleStatus ACTIVE: they vanish from the canvas (filtered out
  // because their thread isn't ACTIVE) but never appear in the recycle bin
  // (which only lists DELETED tasks) — permanently unreachable and
  // unrestorable, and the thread itself can then never be purged either
  // (see emptyRecycleBin / purgeExpiredItems, which refuse to hard-delete a
  // thread that still has a non-deleted task under it, to avoid an FK
  // violation).
  //
  // Only tasks that are still ACTIVE at this moment are cascaded, and they
  // are flagged deletedByThreadCascade so restoreThread can later tell them
  // apart from a task that was already independently deleted before the
  // thread went away — restoring the thread should bring back what it took
  // down with it, not resurrect an unrelated, earlier deletion.
  const deletedAt = new Date();
  const [, thread] = await db.$transaction([
    db.task.updateMany({
      where: { primaryThreadId: threadId, lifecycleStatus: "ACTIVE" },
      data: { lifecycleStatus: "DELETED", deletedAt, deletedByThreadCascade: true },
    }),
    db.thread.update({
      where: { id: threadId },
      data: { status: "DELETED", deletedAt },
    }),
  ]);
  return thread;
}
