"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { resolveThreadRole, canManageTasks, PermissionError } from "@/lib/permissions";
import { getCalibrationThreadSummaries } from "@/lib/threadCalibration";
import { buildPriorityPrompt, parsePriorityResponse } from "@/lib/priorityPrompt";
import { generateText } from "@/lib/gemini";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new PermissionError("You must be logged in.");
  return session.user.id;
}

export async function suggestTaskPriority(taskId: string) {
  const userId = await requireUserId();

  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { primaryThread: { include: { shares: true } } },
  });

  const role = resolveThreadRole({
    ownerId: task.primaryThread.ownerId,
    shares: task.primaryThread.shares.map((s) => ({
      sharedWithUserId: s.sharedWithUserId,
      permission: s.permission,
    })),
    userId,
  });
  if (!canManageTasks(role)) throw new PermissionError();

  const calibrationThreads = await getCalibrationThreadSummaries(userId, task.primaryThreadId);
  const prompt = buildPriorityPrompt(
    { title: task.title, description: task.description, dueDate: task.dueDate },
    task.primaryThread.name,
    calibrationThreads
  );

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const responseText = await generateText(user.preferredAiModel, prompt);
  const priority = parsePriorityResponse(responseText);

  return db.task.update({
    where: { id: taskId },
    data: { priority, priorityIsAiSuggested: true },
  });
}
