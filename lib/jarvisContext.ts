import { db } from "@/lib/db";

export type JarvisThreadContext = { id: string; name: string; summary: string | null };

async function getVisibleThreadIds(userId: string): Promise<string[]> {
  const ownedThreads = await db.thread.findMany({
    where: { ownerId: userId, status: "ACTIVE" },
    select: { id: true },
  });
  const sharedThreadIds = (
    await db.threadShare.findMany({ where: { sharedWithUserId: userId }, select: { threadId: true } })
  ).map((s) => s.threadId);
  const sharedThreads = await db.thread.findMany({
    where: { id: { in: sharedThreadIds }, status: "ACTIVE" },
    select: { id: true },
  });
  return [...ownedThreads.map((t) => t.id), ...sharedThreads.map((t) => t.id)];
}

export async function getThreadsForJarvis(userId: string): Promise<JarvisThreadContext[]> {
  const threadIds = await getVisibleThreadIds(userId);

  const threads = await db.thread.findMany({
    where: { id: { in: threadIds } },
    include: { summary: true },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  return threads.map((t) => ({ id: t.id, name: t.name, summary: t.summary?.summaryText ?? null }));
}

export type JarvisTaskMatch = { id: string; title: string; threadName: string };

export async function findTasksForJarvis(userId: string, query: string): Promise<JarvisTaskMatch[]> {
  const threadIds = await getVisibleThreadIds(userId);

  const tasks = await db.task.findMany({
    where: {
      primaryThreadId: { in: threadIds },
      lifecycleStatus: "ACTIVE",
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ],
    },
    include: { primaryThread: true },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });

  return tasks.map((t) => ({ id: t.id, title: t.title, threadName: t.primaryThread.name }));
}
