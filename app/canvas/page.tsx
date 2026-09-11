import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import ThemeProvider from "@/components/theme/ThemeProvider";
import Canvas from "@/components/canvas/Canvas";

export default async function CanvasPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
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

  const taskPositions = await db.taskPosition.findMany({
    where: { taskId: { in: tasks.map((t) => t.id) }, userId },
  });
  const positions = Object.fromEntries(
    taskPositions.map((p) => [p.taskId, { x: p.positionX, y: p.positionY }])
  );

  return (
    <ThemeProvider themeMode={user.themeMode} accentColor={user.accentColor}>
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
          dueDate: t.dueDate,
          updateCount: t._count.updates,
        }))}
        positions={positions}
      />
    </ThemeProvider>
  );
}
