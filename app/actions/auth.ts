"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { SignupError, PasswordResetError } from "@/lib/auth-errors";

export { SignupError, PasswordResetError };

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export async function signup(input: { email: string; password: string; name: string }) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  if (!email || !input.password || !name) {
    throw new SignupError("Email, password, and name are required.");
  }
  if (input.password.length < 8) {
    throw new SignupError("Password must be at least 8 characters.");
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    throw new SignupError("An account with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await db.user.create({ data: { email, passwordHash, name } });
  return { id: user.id, email: user.email };
}

function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function requestPasswordReset(email: string): Promise<{ resetUrl: string | null }> {
  const normalized = email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email: normalized } });
  if (!user) return { resetUrl: null };

  const token = crypto.randomBytes(32).toString("hex");
  await db.user.update({
    where: { id: user.id },
    data: {
      resetTokenHash: hashResetToken(token),
      resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  // Dev-mode convenience: no email provider is configured in this project
  // (see .env.example), so the reset link is handed back to the caller to
  // display directly instead of being emailed. Only the token's hash is
  // ever persisted; the raw token lives only in this returned URL.
  return { resetUrl: `/reset-password?token=${token}` };
}
