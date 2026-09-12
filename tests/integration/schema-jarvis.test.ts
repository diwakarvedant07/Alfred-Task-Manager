import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";

describe("JarvisMessage schema", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  it("creates a USER message with no toolCalls by default", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });

    const message = await db.jarvisMessage.create({
      data: { userId: user.id, role: "USER", content: "call the vendor tomorrow" },
    });

    expect(message.role).toBe("USER");
    expect(message.content).toBe("call the vendor tomorrow");
    expect(message.toolCalls).toBeNull();
  });

  it("creates an ASSISTANT message with a toolCalls JSON payload", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });

    const message = await db.jarvisMessage.create({
      data: {
        userId: user.id,
        role: "ASSISTANT",
        content: "Created a task for that.",
        toolCalls: [{ tool: "createTaskInThread", success: true, summary: "Created task X in Y" }],
      },
    });

    expect(message.toolCalls).toEqual([{ tool: "createTaskInThread", success: true, summary: "Created task X in Y" }]);
  });

  it("orders messages by createdAt", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    await db.jarvisMessage.create({ data: { userId: user.id, role: "USER", content: "first" } });
    await db.jarvisMessage.create({ data: { userId: user.id, role: "ASSISTANT", content: "second" } });

    const messages = await db.jarvisMessage.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });

    expect(messages.map((m) => m.content)).toEqual(["first", "second"]);
  });
});
