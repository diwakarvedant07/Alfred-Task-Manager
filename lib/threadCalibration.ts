import { db } from "@/lib/db";
import type { CalibrationThread } from "@/lib/priorityPrompt";

export async function getCalibrationThreadSummaries(
  userId: string,
  excludeThreadId: string
): Promise<CalibrationThread[]> {
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

  const threadIds = [...ownedThreads.map((t) => t.id), ...sharedThreads.map((t) => t.id)].filter(
    (id) => id !== excludeThreadId
  );

  const summaries = await db.threadSummary.findMany({
    where: { threadId: { in: threadIds } },
    include: { thread: true },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  return summaries.map((s) => ({ name: s.thread.name, summary: s.summaryText }));
}
