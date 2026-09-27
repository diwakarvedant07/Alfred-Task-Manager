"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { resolveThreadRole, canViewThread, PermissionError } from "@/lib/permissions";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new PermissionError("You must be logged in.");
  return session.user.id;
}

async function requireViewRole(threadId: string, userId: string) {
  const thread = await db.thread.findUniqueOrThrow({
    where: { id: threadId },
    include: { shares: true },
  });
  const role = resolveThreadRole({
    ownerId: thread.ownerId,
    shares: thread.shares.map((s) => ({ sharedWithUserId: s.sharedWithUserId, permission: s.permission })),
    userId,
  });
  if (!canViewThread(role)) throw new PermissionError();
}

// Where a thread's bubble sits on the caller's own canvas. Per-user (like
// TaskPosition), so a viewer dragging a shared thread only rearranges
// their own view — which is why VIEWER access is enough.
export async function saveThreadPosition(threadId: string, positionX: number, positionY: number) {
  const userId = await requireUserId();
  await requireViewRole(threadId, userId);
  return db.threadPosition.upsert({
    where: { threadId_userId: { threadId, userId } },
    create: { threadId, userId, positionX, positionY },
    update: { positionX, positionY },
  });
}
