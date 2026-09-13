import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";

describe("Prisma schema — password reset fields", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  it("defaults resetTokenHash and resetTokenExpiresAt to null", async () => {
    const user = await db.user.create({
      data: { email: "reset-schema@example.com", passwordHash: "x", name: "Res" },
    });

    expect(user.resetTokenHash).toBeNull();
    expect(user.resetTokenExpiresAt).toBeNull();
  });

  it("stores a reset token hash and expiry on a user", async () => {
    const user = await db.user.create({
      data: { email: "reset-schema2@example.com", passwordHash: "x", name: "Res" },
    });
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const updated = await db.user.update({
      where: { id: user.id },
      data: { resetTokenHash: "a".repeat(64), resetTokenExpiresAt: expiresAt },
    });

    expect(updated.resetTokenHash).toBe("a".repeat(64));
    expect(updated.resetTokenExpiresAt).toEqual(expiresAt);
  });
});
