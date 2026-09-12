import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";

describe("Task.priorityIsAiSuggested", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  it("defaults to false on a new task", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "Ada" } });
    const thread = await db.thread.create({ data: { ownerId: user.id, name: "Q3 Report", categoryColor: "#f2c14e" } });
    const task = await db.task.create({ data: { primaryThreadId: thread.id, title: "Draft summary" } });

    expect(task.priorityIsAiSuggested).toBe(false);
  });

  it("can be set to true explicitly", async () => {
    const user = await db.user.create({ data: { email: "b@x.com", passwordHash: "x", name: "Bo" } });
    const thread = await db.thread.create({ data: { ownerId: user.id, name: "Thread", categoryColor: "#38e0ff" } });
    const task = await db.task.create({
      data: { primaryThreadId: thread.id, title: "Task", priorityIsAiSuggested: true },
    });

    expect(task.priorityIsAiSuggested).toBe(true);
  });
});
