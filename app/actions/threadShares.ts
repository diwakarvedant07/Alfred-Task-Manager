"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { resolveThreadRole, canManageShares, PermissionError } from "@/lib/permissions";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new PermissionError("You must be logged in.");
  return session.user.id;
}

async function requireOwnerRole(threadId: string, userId: string) {
  const thread = await db.thread.findUniqueOrThrow({
    where: { id: threadId },
    include: { shares: true },
  });
  const role = resolveThreadRole({
    ownerId: thread.ownerId,
    shares: thread.shares.map((s) => ({ sharedWithUserId: s.sharedWithUserId, permission: s.permission })),
    userId,
  });
  if (!canManageShares(role)) throw new PermissionError();
}

export async function shareThread(threadId: string, email: string, permission: "VIEWER" | "EDITOR") {
  const userId = await requireUserId();
  await requireOwnerRole(threadId, userId);

  const recipient = await db.user.findUniqueOrThrow({ where: { email: email.trim().toLowerCase() } });
  return db.threadShare.create({
    data: { threadId, sharedWithUserId: recipient.id, permission },
  });
}

export async function listThreadShares(threadId: string) {
  const userId = await requireUserId();
  await requireOwnerRole(threadId, userId);
  return db.threadShare.findMany({ where: { threadId } });
}

export async function revokeThreadShare(shareId: string) {
  const userId = await requireUserId();
  const share = await db.threadShare.findUniqueOrThrow({ where: { id: shareId } });
  await requireOwnerRole(share.threadId, userId);
  await db.threadShare.delete({ where: { id: shareId } });
}
