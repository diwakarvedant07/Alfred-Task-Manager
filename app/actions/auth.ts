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

export async function requestPasswordReset(email: string): Promise<{ resetUrl: string }> {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_RESET_LINK !== "true") {
    // This function hands the raw reset token straight back to the caller
    // instead of emailing it — a deliberate dev-mode convenience for this
    // project (no email provider is configured; see .env.example). That
    // convenience is also a full account-takeover primitive for any
    // guessable email if this ever ran in production, since anyone holding
    // the returned link can complete a reset for that account. Refuse to
    // run in production unless explicitly opted in via
    // ALLOW_INSECURE_RESET_LINK=true (a stopgap until email is wired up).
    throw new Error(
      "requestPasswordReset must not reveal the reset link directly in production — wire up a real email provider first."
    );
  }

  const normalized = email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email: normalized } });

  const token = crypto.randomBytes(32).toString("hex");

  if (user) {
    await db.user.update({
      where: { id: user.id },
      data: {
        resetTokenHash: hashResetToken(token),
        resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
  }

  // Always return a URL-shaped response, even for an unknown email — this
  // closes the *response-shape* oracle (a caller can no longer tell known
  // from unknown emails by whether resetUrl is null), since a Server Action
  // is a directly callable network endpoint, not something reached only
  // through the UI. For an unknown email, `token` is generated but never
  // stored, so the resulting link simply won't validate in resetPassword()
  // — same as any other garbage token.
  //
  // This does NOT close user enumeration end to end: handing the raw token
  // back to the caller (rather than emailing it) means anyone can take the
  // returned link straight to resetPassword() and learn from its outcome
  // whether the email had an account — a real account-takeover primitive
  // for any guessable email. That's an inherent consequence of the
  // dev-mode reveal above, not something this response shape alone fixes;
  // the production guard above is what actually prevents it from shipping.
  //
  // Dev-mode convenience: no email provider is configured in this project
  // (see .env.example), so the reset link is handed back to the caller to
  // display directly instead of being emailed. Only the token's hash is
  // ever persisted; the raw token lives only in this returned URL.
  return { resetUrl: `/reset-password?token=${token}` };
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  if (newPassword.length < 8) {
    throw new PasswordResetError("Password must be at least 8 characters.");
  }

  const user = await db.user.findFirst({ where: { resetTokenHash: hashResetToken(token) } });
  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    throw new PasswordResetError("This reset link is invalid or has expired.");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash, resetTokenHash: null, resetTokenExpiresAt: null },
  });
}
