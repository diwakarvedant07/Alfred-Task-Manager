import { db } from "@/lib/db";

export type ThreadActivityTask = {
  id: string;
  title: string;
  workStatus: string;
  priority: string;
  dueDate: Date | null;
  isNew: boolean;
};

export type ThreadActivityUpdate = {
  taskTitle: string;
  authorName: string;
  body: string;
  createdAt: Date;
};

export type ThreadActivity = {
  tasks: ThreadActivityTask[];
  updates: ThreadActivityUpdate[];
};

function taskWhere(threadId: string, since: Date | null) {
  if (since === null) {
    return { primaryThreadId: threadId };
  }
  return {
    primaryThreadId: threadId,
    OR: [{ createdAt: { gt: since } }, { updatedAt: { gt: since } }],
  };
}

function updateWhere(threadId: string, since: Date | null) {
  if (since === null) {
    return { task: { primaryThreadId: threadId } };
  }
  return { task: { primaryThreadId: threadId }, createdAt: { gt: since } };
}

export async function hasNewThreadActivity(threadId: string, since: Date | null): Promise<boolean> {
  const taskCount = await db.task.count({ where: taskWhere(threadId, since) });
  if (taskCount > 0) return true;
  const updateCount = await db.taskUpdate.count({ where: updateWhere(threadId, since) });
  return updateCount > 0;
}

export async function getNewThreadActivity(threadId: string, since: Date | null): Promise<ThreadActivity> {
  const tasks = await db.task.findMany({ where: taskWhere(threadId, since) });
  const activityTasks: ThreadActivityTask[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    workStatus: t.workStatus,
    priority: t.priority,
    dueDate: t.dueDate,
    isNew: since === null || t.createdAt > since,
  }));

  const updates = await db.taskUpdate.findMany({
    where: updateWhere(threadId, since),
    include: { author: true, task: true },
    orderBy: { createdAt: "asc" },
  });
  const activityUpdates: ThreadActivityUpdate[] = updates.map((u) => ({
    taskTitle: u.task.title,
    authorName: u.author.name,
    body: u.body,
    createdAt: u.createdAt,
  }));

  return { tasks: activityTasks, updates: activityUpdates };
}
