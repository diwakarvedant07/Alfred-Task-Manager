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

  const taskIds = tasks.map((t) => t.id);
  const threadIds = threads.map((t) => t.id);

  // A thread can only be hard-deleted once nothing still points at it. If a
  // task is still primarily attached to one of these threads and isn't
  // itself being purged in this batch (e.g. an ACTIVE task left behind by a
  // soft-deleted thread, since deleteThread doesn't cascade to children),
  // hard-deleting the thread would either orphan that task or violate the
  // FK constraint — so skip that thread rather than throwing. It stays in
  // the recycle bin until its remaining tasks are also cleared out.
  const threadsWithRemainingTasks = threadIds.length
    ? await db.task.findMany({
        where: { primaryThreadId: { in: threadIds }, id: { notIn: taskIds } },
        select: { primaryThreadId: true },
      })
    : [];
  const blockedThreadIds = new Set(threadsWithRemainingTasks.map((t) => t.primaryThreadId));
  const purgeableThreadIds = threadIds.filter((id) => !blockedThreadIds.has(id));

  const [, , , , taskDeleteResult, threadDeleteResult] = await db.$transaction([
    // Dependent rows must go before the tasks/threads they reference, or
    // the deleteMany below fails with a foreign key constraint violation.
    db.taskUpdate.deleteMany({ where: { taskId: { in: taskIds } } }),
    db.taskPosition.deleteMany({ where: { taskId: { in: taskIds } } }),
    db.taskThreadLink.deleteMany({
      where: { OR: [{ taskId: { in: taskIds } }, { threadId: { in: purgeableThreadIds } }] },
    }),
    db.threadShare.deleteMany({ where: { threadId: { in: purgeableThreadIds } } }),
    db.task.deleteMany({ where: { id: { in: taskIds } } }),
    db.thread.deleteMany({ where: { id: { in: purgeableThreadIds } } }),
  ]);

  return { threadsDeleted: threadDeleteResult.count, tasksDeleted: taskDeleteResult.count };
}
