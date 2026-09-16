import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";

describe("JarvisSession / JarvisMessage schema", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  it("creates a session with a null title by default", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });

    const session = await db.jarvisSession.create({ data: { userId: user.id } });

    expect(session.title).toBeNull();
    expect(session.userId).toBe(user.id);
  });

  it("creates a USER message with no toolCalls or token counts by default", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    const session = await db.jarvisSession.create({ data: { userId: user.id } });

    const message = await db.jarvisMessage.create({
      data: { sessionId: session.id, userId: user.id, role: "USER", content: "call the vendor tomorrow" },
    });

    expect(message.content).toBe("call the vendor tomorrow");
    expect(message.toolCalls).toBeNull();
    expect(message.totalTokens).toBeNull();
  });

  it("creates an ASSISTANT message with a toolCalls JSON payload and token counts", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    const session = await db.jarvisSession.create({ data: { userId: user.id } });

    const message = await db.jarvisMessage.create({
      data: {
        sessionId: session.id,
        userId: user.id,
        role: "ASSISTANT",
        content: "Created a task for that.",
        toolCalls: [{ tool: "createTaskInThread", success: true, summary: "Created task X in Y" }],
        promptTokens: 50,
        completionTokens: 12,
        totalTokens: 62,
      },
    });

    expect(message.toolCalls).toEqual([{ tool: "createTaskInThread", success: true, summary: "Created task X in Y" }]);
    expect(message.totalTokens).toBe(62);
  });

  it("orders a session's messages by createdAt", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    const session = await db.jarvisSession.create({ data: { userId: user.id } });
    await db.jarvisMessage.create({ data: { sessionId: session.id, userId: user.id, role: "USER", content: "first" } });
    await db.jarvisMessage.create({ data: { sessionId: session.id, userId: user.id, role: "ASSISTANT", content: "second" } });

    const messages = await db.jarvisMessage.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: "asc" } });

    expect(messages.map((m) => m.content)).toEqual(["first", "second"]);
  });

  it("cascades: deleting a session deletes its messages", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    const session = await db.jarvisSession.create({ data: { userId: user.id } });
    await db.jarvisMessage.create({ data: { sessionId: session.id, userId: user.id, role: "USER", content: "hi" } });

    await db.jarvisSession.delete({ where: { id: session.id } });

    const remaining = await db.jarvisMessage.findMany({ where: { sessionId: session.id } });
    expect(remaining).toHaveLength(0);
  });
});
