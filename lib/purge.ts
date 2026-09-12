import { db } from "@/lib/db";

export const PURGE_THRESHOLD_DAYS = 30;

export function isPastPurgeThreshold(deletedAt: Date, now: Date): boolean {
  const ageMs = now.getTime() - deletedAt.getTime();
  return ageMs > PURGE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
}

function cutoff(now: Date): Date {
  return new Date(now.getTime() - PURGE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Hard-deletes every soft-deleted task and thread (across all users) whose
 * deletedAt is past the purge threshold.
 *
 * This mirrors the fix made in app/actions/recycleBin.ts's emptyRecycleBin():
 * hard-deleting a Task or Thread without first clearing rows that carry a
 * foreign key to it (TaskUpdate, TaskPosition, TaskThreadLink, ThreadShare,
 * ThreadView, ThreadSummary) throws a Postgres FK constraint violation, so
 * dependent rows are deleted first, all in one transaction. A thread is only purged once nothing still
 * points at it: if a task is still primarily attached to an expired thread
 * but isn't itself expired, hard-deleting the thread would orphan that task
 * or violate the FK constraint, so that thread is skipped rather than
 * crashing the whole job.
 *
 * app/actions/threads.ts's deleteThread cascades its soft-delete onto every
 * ACTIVE task under a thread, and app/actions/recycleBin.ts's restoreTask
 * refuses to independently restore a task whose thread is still DELETED
 * (RestoreBlockedError) — the path that used to let a restored task
 * reopen this exact gap. So a DELETED thread should not end up with a
 * remaining ACTIVE task through this app's own Server Actions.
 *
 * This check is kept as defense-in-depth rather than removed: there's no
 * server-side guard stopping a task from being created in, or moved into,
 * an already-DELETED thread in the first place (createTask,
 * moveTaskToThread — a separate gap outside this fix's scope), and a direct
 * DB write or pre-cascade-fix data could also violate the invariant. When
 * it does, the thread stays in the recycle bin until its remaining tasks
 * are also cleared out (deleted, or the thread itself un-deleted).
 */
export async function purgeExpiredItems(now: Date): Promise<{ threadsDeleted: number; tasksDeleted: number }> {
  const threshold = cutoff(now);

  const [expiredTasks, expiredThreads] = await Promise.all([
    db.task.findMany({
      where: { lifecycleStatus: "DELETED", deletedAt: { lt: threshold } },
      select: { id: true },
    }),
    db.thread.findMany({
      where: { status: "DELETED", deletedAt: { lt: threshold } },
      select: { id: true },
    }),
  ]);

  const taskIds = expiredTasks.map((t) => t.id);
  const threadIds = expiredThreads.map((t) => t.id);

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
