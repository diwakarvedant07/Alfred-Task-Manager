import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";

describe("ThreadView and ThreadSummary schema", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  it("creates a ThreadView keyed by (threadId, userId) and a User with the default preferredAiModel", async () => {
    const user = await db.user.create({
      data: { email: "a@example.com", passwordHash: "x", name: "Ada" },
    });
    const thread = await db.thread.create({
      data: { ownerId: user.id, name: "Q3 Report", categoryColor: "#f2c14e" },
    });

    expect(user.preferredAiModel).toBe("gemini-2.5-pro");

    const view = await db.threadView.create({
      data: { threadId: thread.id, userId: user.id, lastViewedAt: new Date("2026-01-01") },
    });
    expect(view.threadId).toBe(thread.id);
    expect(view.userId).toBe(user.id);

    const fetched = await db.threadView.findUnique({
      where: { threadId_userId: { threadId: thread.id, userId: user.id } },
    });
    expect(fetched).not.toBeNull();
  });

  it("creates a ThreadSummary with a unique threadId", async () => {
    const user = await db.user.create({
      data: { email: "b@example.com", passwordHash: "x", name: "Bo" },
    });
    const thread = await db.thread.create({
      data: { ownerId: user.id, name: "Primary", categoryColor: "#38e0ff" },
    });

    const summary = await db.threadSummary.create({
      data: { threadId: thread.id, summaryText: "Initial summary.", lastIncludedAt: new Date() },
    });
    expect(summary.threadId).toBe(thread.id);

    await expect(
      db.threadSummary.create({
        data: { threadId: thread.id, summaryText: "Duplicate.", lastIncludedAt: new Date() },
      })
    ).rejects.toThrow();
  });
});
