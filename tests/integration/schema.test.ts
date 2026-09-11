import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";

describe("Prisma schema", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  it("creates a user, thread, and task with a required primary thread FK", async () => {
    const user = await db.user.create({
      data: { email: "a@example.com", passwordHash: "x", name: "Ada" },
    });
    const thread = await db.thread.create({
      data: { ownerId: user.id, name: "Q3 Report", categoryColor: "#f2c14e" },
    });
    const task = await db.task.create({
      data: { primaryThreadId: thread.id, title: "Draft exec summary" },
    });

    expect(task.primaryThreadId).toBe(thread.id);
    expect(task.workStatus).toBe("TODO");
    expect(user.themeMode).toBe("DARK");
    expect(user.accentColor).toBe("#38e0ff");
  });

  it("supports many-to-many secondary thread links via a junction table", async () => {
    const user = await db.user.create({
      data: { email: "b@example.com", passwordHash: "x", name: "Bo" },
    });
    const primary = await db.thread.create({
      data: { ownerId: user.id, name: "Primary", categoryColor: "#38e0ff" },
    });
    const secondary = await db.thread.create({
      data: { ownerId: user.id, name: "Secondary", categoryColor: "#ff5fa8" },
    });
    const task = await db.task.create({
      data: { primaryThreadId: primary.id, title: "Cross-cutting task" },
    });

    await db.taskThreadLink.create({
      data: { taskId: task.id, threadId: secondary.id },
    });

    const links = await db.taskThreadLink.findMany({ where: { taskId: task.id } });
    expect(links).toHaveLength(1);
    expect(links[0].threadId).toBe(secondary.id);
  });
});
