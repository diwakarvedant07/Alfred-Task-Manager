import { describe, it, expect, beforeEach, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { signup, SignupError } from "@/app/actions/auth";

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
