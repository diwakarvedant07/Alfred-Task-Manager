import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Canvas from "@/components/canvas/Canvas";

export default async function CanvasPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const ownThreads = await db.thread.findMany({
    where: { ownerId: userId, status: "ACTIVE" },
  });
  const myShares = await db.threadShare.findMany({ where: { sharedWithUserId: userId } });
  const sharePermissionByThreadId = new Map(myShares.map((s) => [s.threadId, s.permission]));
  const sharedThreads = await db.thread.findMany({
    where: { id: { in: myShares.map((s) => s.threadId) }, status: "ACTIVE" },
  });
  const threads = [...ownThreads, ...sharedThreads];

  const tasks = await db.task.findMany({
    where: { primaryThreadId: { in: threads.map((t) => t.id) }, lifecycleStatus: "ACTIVE" },
    include: { _count: { select: { updates: true } } },
  });

  const threadPositionRows = await db.threadPosition.findMany({
    where: { threadId: { in: threads.map((t) => t.id) }, userId },
  });
  const threadPositions = Object.fromEntries(
    threadPositionRows.map((p) => [p.threadId, { x: p.positionX, y: p.positionY }])
  );

  const jarvisSessions = await db.jarvisSession.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
  });

  return (
    <Canvas
      threads={threads.map((t) => ({
        id: t.id,
        name: t.name,
        categoryColor: t.categoryColor,
        role: t.ownerId === userId ? ("OWNER" as const) : sharePermissionByThreadId.get(t.id)!,
      }))}
      tasks={tasks.map((t) => ({
        id: t.id,
        primaryThreadId: t.primaryThreadId,
        title: t.title,
        description: t.description,
        workStatus: t.workStatus,
        priority: t.priority,
        priorityIsAiSuggested: t.priorityIsAiSuggested,
        dueDate: t.dueDate,
        updateCount: t._count.updates,
      }))}
      threadPositions={threadPositions}
      userId={userId}
      initialJarvisSessions={jarvisSessions}
    />
  );
}
