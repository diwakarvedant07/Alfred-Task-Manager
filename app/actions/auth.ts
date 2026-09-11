"use server";

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { SignupError } from "@/lib/auth-errors";

export { SignupError };

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
