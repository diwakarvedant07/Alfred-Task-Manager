import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { PermissionError } from "@/lib/permissions";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

import { updatePreferredAiModel } from "@/app/actions/aiModel";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("updatePreferredAiModel", () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "Ada" } });
    userId = user.id;
  });
  afterAll(async () => db.$disconnect());

  it("updates the user's preferredAiModel", async () => {
    await loginAs(userId);
    const updated = await updatePreferredAiModel("gemini-2.5-flash");
    expect(updated.preferredAiModel).toBe("gemini-2.5-flash");

    const fetched = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(fetched.preferredAiModel).toBe("gemini-2.5-flash");
  });

  it("accepts an arbitrary custom model id, trimmed", async () => {
    await loginAs(userId);
    const updated = await updatePreferredAiModel("  gemini-3.0-experimental  ");
    expect(updated.preferredAiModel).toBe("gemini-3.0-experimental");
  });

  it("rejects an empty model id", async () => {
    await loginAs(userId);
    await expect(updatePreferredAiModel("   ")).rejects.toThrow();
  });

  it("requires being logged in", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(updatePreferredAiModel("gemini-2.5-pro")).rejects.toThrow(PermissionError);
  });
});
