"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";

export async function updatePreferredAiModel(model: string) {
  const session = await auth();
  if (!session?.user?.id) throw new PermissionError("You must be logged in.");

  const trimmed = model.trim();
  if (!trimmed) {
    throw new Error("Model id must not be empty.");
  }

  return db.user.update({
    where: { id: session.user.id },
    data: { preferredAiModel: trimmed },
  });
}
