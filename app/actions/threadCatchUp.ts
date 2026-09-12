"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { resolveThreadRole, canViewThread, PermissionError } from "@/lib/permissions";
import { runThreadCatchUp } from "@/lib/threadCatchUp";

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
  return thread;
}

// Public Server Action — every exported function in a "use server" file is
// effectively a public endpoint, and every parameter is attacker-controlled.
// This deliberately takes NO time value from the caller: it always uses the
// real `new Date()`. A previous version accepted an optional `now: Date`
// override (to make testing easier), which let any Viewer with access to a
// shared thread force staleness on demand (triggering a billed Gemini call
// at will) and/or push ThreadSummary.lastIncludedAt into the future,
// permanently breaking catch-up on that thread for every collaborator. The
// actual staleness/regeneration logic — which DOES take an explicit `now`
// for tests — lives in lib/threadCatchUp.ts's runThreadCatchUp.
export async function openThreadAndMaybeGetCatchUp(
  threadId: string
): Promise<{ showCatchUp: boolean; summary: string | null }> {
  const userId = await requireUserId();
  await requireViewRole(threadId, userId);
  return runThreadCatchUp(threadId, userId, new Date());
}

export async function getStoredThreadSummary(threadId: string): Promise<string | null> {
  const userId = await requireUserId();
  await requireViewRole(threadId, userId);
  const summary = await db.threadSummary.findUnique({ where: { threadId } });
  return summary?.summaryText ?? null;
}
