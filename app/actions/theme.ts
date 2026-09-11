"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export async function updateThemePreference(themeMode: "LIGHT" | "DARK", accentColor: string) {
  const session = await auth();
  if (!session?.user?.id) throw new PermissionError("You must be logged in.");
  if (!HEX_COLOR.test(accentColor)) {
    throw new Error("accentColor must be a 6-digit hex value, e.g. #38e0ff.");
  }
  return db.user.update({
    where: { id: session.user.id },
    data: { themeMode, accentColor },
  });
}
