"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { resolveThreadRole, canViewThread, PermissionError } from "@/lib/permissions";
import { isThreadStale } from "@/lib/threadStaleness";
import { hasNewThreadActivity, getNewThreadActivity } from "@/lib/threadActivity";
import { buildCatchUpPrompt } from "@/lib/catchUpPrompt";
import { generateText } from "@/lib/gemini";

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

export async function openThreadAndMaybeGetCatchUp(
  threadId: string,
  now: Date = new Date()
): Promise<{ showCatchUp: boolean; summary: string | null }> {
  const userId = await requireUserId();
  const thread = await requireViewRole(threadId, userId);

  const view = await db.threadView.findUnique({
    where: { threadId_userId: { threadId, userId } },
  });
  const stale = isThreadStale(view?.lastViewedAt ?? null, now);

  await db.threadView.upsert({
    where: { threadId_userId: { threadId, userId } },
    create: { threadId, userId, lastViewedAt: now },
    update: { lastViewedAt: now },
  });

  if (!stale) {
    return { showCatchUp: false, summary: null };
  }

  const existingSummary = await db.threadSummary.findUnique({ where: { threadId } });
  const cursor = existingSummary?.lastIncludedAt ?? null;
  const hasActivity = await hasNewThreadActivity(threadId, cursor);

  if (!hasActivity) {
    return {
      showCatchUp: true,
      summary: existingSummary?.summaryText ?? "Nothing to catch up on yet.",
    };
  }

  const activity = await getNewThreadActivity(threadId, cursor);
  const prompt = buildCatchUpPrompt(thread.name, existingSummary?.summaryText ?? null, activity);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const summaryText = await generateText(user.preferredAiModel, prompt);

  await db.threadSummary.upsert({
    where: { threadId },
    create: { threadId, summaryText, lastIncludedAt: now },
    update: { summaryText, lastIncludedAt: now },
  });

  return { showCatchUp: true, summary: summaryText };
}

export async function getStoredThreadSummary(threadId: string): Promise<string | null> {
  const userId = await requireUserId();
  await requireViewRole(threadId, userId);
  const summary = await db.threadSummary.findUnique({ where: { threadId } });
  return summary?.summaryText ?? null;
}
