import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { signup, SignupError, requestPasswordReset, resetPassword, PasswordResetError } from "@/app/actions/auth";

describe("signup", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  it("creates a user with a hashed password", async () => {
    const result = await signup({ email: "New@Example.com", password: "correcthorse", name: "Nova" });
    const user = await db.user.findUnique({ where: { email: "new@example.com" } });

    expect(result.email).toBe("new@example.com");
    expect(user).not.toBeNull();
    expect(user!.passwordHash).not.toBe("correcthorse");
    expect(await bcrypt.compare("correcthorse", user!.passwordHash)).toBe(true);
  });

  it("rejects a duplicate email", async () => {
    await signup({ email: "dup@example.com", password: "correcthorse", name: "Dup" });
    await expect(
      signup({ email: "dup@example.com", password: "anotherpassword", name: "Dup2" })
    ).rejects.toThrow(SignupError);
  });

  it("rejects a password shorter than 8 characters", async () => {
    await expect(
      signup({ email: "short@example.com", password: "short", name: "Shorty" })
    ).rejects.toThrow(SignupError);
  });
});

describe("requestPasswordReset", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  it("returns a reset URL containing a token for an existing account, storing only its hash", async () => {
    await signup({ email: "reset@example.com", password: "correcthorse", name: "Reese" });

    const { resetUrl } = await requestPasswordReset("Reset@Example.com");

    expect(resetUrl).toMatch(/^\/reset-password\?token=[0-9a-f]{64}$/);
    const user = await db.user.findUniqueOrThrow({ where: { email: "reset@example.com" } });
    expect(user.resetTokenHash).not.toBeNull();
    expect(user.resetTokenExpiresAt).not.toBeNull();
    const token = new URL(resetUrl, "http://x").searchParams.get("token")!;
    expect(user.resetTokenHash).not.toBe(token);
  });

  it("returns an equally URL-shaped response for an unknown email, without creating a user or storing a token", async () => {
    const { resetUrl } = await requestPasswordReset("nobody@example.com");

    expect(resetUrl).toMatch(/^\/reset-password\?token=[0-9a-f]{64}$/);
    const user = await db.user.findUnique({ where: { email: "nobody@example.com" } });
    expect(user).toBeNull();
  });

  it("refuses to reveal the reset link when NODE_ENV is production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      await expect(requestPasswordReset("reset@example.com")).rejects.toThrow(
        /must not reveal the reset link directly in production/
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("resetPassword", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  async function requestToken(email: string): Promise<string> {
    const { resetUrl } = await requestPasswordReset(email);
    return new URL(resetUrl, "http://x").searchParams.get("token")!;
  }

  it("updates the password and clears the token", async () => {
    await signup({ email: "reset2@example.com", password: "oldpassword", name: "Reese" });
    const token = await requestToken("reset2@example.com");

    await resetPassword(token, "newpassword123");

    const user = await db.user.findUniqueOrThrow({ where: { email: "reset2@example.com" } });
    expect(await bcrypt.compare("newpassword123", user.passwordHash)).toBe(true);
    expect(user.resetTokenHash).toBeNull();
    expect(user.resetTokenExpiresAt).toBeNull();
  });

  it("rejects an unknown token", async () => {
    await expect(resetPassword("not-a-real-token", "newpassword123")).rejects.toThrow(PasswordResetError);
  });

  it("rejects a token that has already expired", async () => {
    await signup({ email: "reset3@example.com", password: "oldpassword", name: "Reese" });
    const token = await requestToken("reset3@example.com");
    await db.user.update({
      where: { email: "reset3@example.com" },
      data: { resetTokenExpiresAt: new Date(Date.now() - 1000) },
    });

    await expect(resetPassword(token, "newpassword123")).rejects.toThrow(PasswordResetError);
  });

  it("rejects a password shorter than 8 characters", async () => {
    await signup({ email: "reset4@example.com", password: "oldpassword", name: "Reese" });
    const token = await requestToken("reset4@example.com");

    await expect(resetPassword(token, "short")).rejects.toThrow(PasswordResetError);
  });

  it("rejects reusing an already-consumed token", async () => {
    await signup({ email: "reset5@example.com", password: "oldpassword", name: "Reese" });
    const token = await requestToken("reset5@example.com");
    await resetPassword(token, "newpassword123");

    await expect(resetPassword(token, "anotherpassword123")).rejects.toThrow(PasswordResetError);
  });
});
