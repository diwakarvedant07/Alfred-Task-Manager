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

  // deleteThread cascades a soft-delete onto tasks that were still ACTIVE at
  // the time, flagging them deletedByThreadCascade. Restoring the thread
  // restores those tasks with it (only those — filtered on the flag), but
  // leaves alone any task that was already DELETED on its own before the
  // thread was deleted; that independent deletion isn't something restoring
  // the thread should undo.
  const [, restored] = await db.$transaction([
    db.task.updateMany({
      where: { primaryThreadId: threadId, lifecycleStatus: "DELETED", deletedByThreadCascade: true },
      data: { lifecycleStatus: "ACTIVE", deletedAt: null, deletedByThreadCascade: false },
    }),
    db.thread.update({ where: { id: threadId }, data: { status: "ACTIVE", deletedAt: null } }),
  ]);
  return restored;
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

  // A thread can only be hard-deleted once nothing still points at it.
  // deleteThread now cascades its soft-delete onto every ACTIVE task
  // underneath it, so in normal operation a DELETED thread never has a
  // remaining ACTIVE task and this filter is a no-op. It's kept as
  // defense-in-depth rather than removed: if that invariant is ever violated
  // (a bug, a direct DB write, data from before the cascade fix existed),
  // hard-deleting the thread anyway would either orphan the task or violate
  // the FK constraint, so it's skipped rather than crashing the whole
  // "Empty Recycle Bin" action. It would stay in the recycle bin until its
  // remaining tasks are also cleared out.
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
