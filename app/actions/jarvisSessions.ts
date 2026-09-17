"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new PermissionError("You must be logged in.");
  return session.user.id;
}

async function requireOwnJarvisSession(sessionId: string, userId: string) {
  const jarvisSession = await db.jarvisSession.findUniqueOrThrow({ where: { id: sessionId } });
  if (jarvisSession.userId !== userId) throw new PermissionError();
  return jarvisSession;
}

export async function createJarvisSession() {
  const userId = await requireUserId();
  return db.jarvisSession.create({ data: { userId } });
}

export async function listJarvisSessions() {
  const userId = await requireUserId();
  return db.jarvisSession.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
  });
}

export async function renameJarvisSession(sessionId: string, title: string) {
  const userId = await requireUserId();
  await requireOwnJarvisSession(sessionId, userId);
  const trimmed = title.trim();
  await db.jarvisSession.update({ where: { id: sessionId }, data: { title: trimmed === "" ? null : trimmed } });
}

export async function deleteJarvisSession(sessionId: string) {
  const userId = await requireUserId();
  await requireOwnJarvisSession(sessionId, userId);
  await db.jarvisSession.delete({ where: { id: sessionId } });
}

export async function listJarvisMessages(sessionId: string) {
  const userId = await requireUserId();
  await requireOwnJarvisSession(sessionId, userId);
  return db.jarvisMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, toolCalls: true, totalTokens: true },
  });
}
