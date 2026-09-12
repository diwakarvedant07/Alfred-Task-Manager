import { db } from "@/lib/db";
import { isThreadStale } from "@/lib/threadStaleness";
import { hasNewThreadActivity, getNewThreadActivity } from "@/lib/threadActivity";
import { buildCatchUpPrompt } from "@/lib/catchUpPrompt";
import { generateText } from "@/lib/gemini";

/**
 * The actual "open a thread, maybe show a catch-up" logic, factored out of
 * the "use server" Server Action in app/actions/threadCatchUp.ts so it can
 * take an explicit `now` for tests without exposing a client-injectable
 * clock on the public boundary (every exported function in a "use server"
 * file is callable directly by any client with a session, and every
 * parameter is attacker-controlled). The Server Action itself has no `now`
 * parameter at all and always calls this with `new Date()`.
 *
 * `userId` is the already-authenticated/authorized caller — this function is
 * pure of `auth()`; the Server Action performs the login + canViewThread
 * checks before ever calling here.
 */
export async function runThreadCatchUp(
  threadId: string,
  userId: string,
  now: Date
): Promise<{ showCatchUp: boolean; summary: string | null }> {
  const thread = await db.thread.findUniqueOrThrow({ where: { id: threadId } });

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
