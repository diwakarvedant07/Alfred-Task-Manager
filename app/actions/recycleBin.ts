"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { RestoreBlockedError } from "@/lib/recycleBin-errors";

export { RestoreBlockedError };

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

  // listDeletedItems lists every DELETED task under an owned thread,
  // including ones whose thread is itself still DELETED (cascade-deleted
  // tasks, or tasks that were independently deleted before their thread
  // was). Restoring one of those to ACTIVE here — without also restoring
  // the thread — would recreate the exact bug deleteThread's cascade fixed:
  // the task becomes invisible on the canvas (its thread isn't ACTIVE),
  // disappears from the recycle bin (it's no longer DELETED), and
  // permanently blocks the thread from emptyRecycleBin/purgeExpiredItems
  // (their "thread still has a non-deleted task" skip condition now matches
  // it forever). Refuse it instead: restoring the thread is what brings
  // this task back, either automatically (if it was cascade-deleted) or by
  // restoring the thread and then this task separately.
  if (task.primaryThread.status === "DELETED") {
    throw new RestoreBlockedError(
      "This task's thread is still deleted. Restore the thread to bring this task back."
    );
  }

  return db.task.update({
    where: { id: taskId },
    data: { lifecycleStatus: "ACTIVE", deletedAt: null, deletedByThreadCascade: false },
  });
}

export async function emptyRecycleBin() {
  await requireUserId();
  const { threads, tasks } = await listDeletedItems();

  const taskIds = tasks.map((t) => t.id);
  const threadIds = threads.map((t) => t.id);

  // A thread can only be hard-deleted once nothing still points at it.
  // deleteThread cascades its soft-delete onto every ACTIVE task underneath
  // it, and restoreTask now refuses to independently restore a task whose
  // thread is still DELETED (see RestoreBlockedError above) — the one path
  // that used to let a restored task reopen this gap. Between the two, a
  // DELETED thread should not end up with a remaining ACTIVE task through
  // this app's own Server Actions.
  //
  // This is still kept as defense-in-depth rather than removed: there's no
  // server-side guard (in createTask or moveTaskToThread) stopping a task
  // from being created in, or moved into, an already-DELETED thread in the
  // first place — an existing, separate gap outside this fix's scope — and
  // a direct DB write or pre-cascade-fix data could also violate the
  // invariant. If that happens, hard-deleting the thread anyway would
  // either orphan the task or violate the FK constraint, so it's skipped
  // rather than crashing the whole "Empty Recycle Bin" action. It would
  // stay in the recycle bin until its remaining tasks are also cleared out.
  const threadsWithRemainingTasks = threadIds.length
    ? await db.task.findMany({
        where: { primaryThreadId: { in: threadIds }, id: { notIn: taskIds } },
        select: { primaryThreadId: true },
      })
    : [];
  const blockedThreadIds = new Set(threadsWithRemainingTasks.map((t) => t.primaryThreadId));
  const purgeableThreadIds = threadIds.filter((id) => !blockedThreadIds.has(id));

  const [, , , , , , taskDeleteResult, threadDeleteResult] = await db.$transaction([
    // Dependent rows must go before the tasks/threads they reference, or
    // the deleteMany below fails with a foreign key constraint violation.
    // ThreadView and ThreadSummary both carry a required (RESTRICT) FK into
    // Thread and must be cleared here too — openThreadAndMaybeGetCatchUp
    // upserts a ThreadView on every thread-bubble click, so essentially any
    // thread a user has opened has one.
    db.taskUpdate.deleteMany({ where: { taskId: { in: taskIds } } }),
    db.taskPosition.deleteMany({ where: { taskId: { in: taskIds } } }),
    db.taskThreadLink.deleteMany({
      where: { OR: [{ taskId: { in: taskIds } }, { threadId: { in: purgeableThreadIds } }] },
    }),
    db.threadShare.deleteMany({ where: { threadId: { in: purgeableThreadIds } } }),
    db.threadView.deleteMany({ where: { threadId: { in: purgeableThreadIds } } }),
    db.threadSummary.deleteMany({ where: { threadId: { in: purgeableThreadIds } } }),
    db.task.deleteMany({ where: { id: { in: taskIds } } }),
    db.thread.deleteMany({ where: { id: { in: purgeableThreadIds } } }),
  ]);

  return { threadsDeleted: threadDeleteResult.count, tasksDeleted: taskDeleteResult.count };
}
