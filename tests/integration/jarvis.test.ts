import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { PermissionError } from "@/lib/permissions";
import { createThread } from "@/app/actions/threads";
import { createTask } from "@/app/actions/tasks";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

vi.mock("@/lib/gemini", () => ({ generateWithTools: vi.fn(), generateText: vi.fn() }));
import { generateWithTools } from "@/lib/gemini";

vi.mock("@/app/actions/taskPriority", () => ({ suggestTaskPriority: vi.fn().mockResolvedValue(undefined) }));

import { sendJarvisMessage } from "@/app/actions/jarvis";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

const ZERO_USAGE = { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 };

function textOnlyResponse(text: string, usage = ZERO_USAGE) {
  return {
    text,
    functionCalls: [],
    modelContent: { role: "model", parts: [{ text }] },
    usage,
  };
}

function toolCallResponse(calls: { name: string; args: Record<string, unknown> }[], usage = ZERO_USAGE) {
  return {
    text: "",
    functionCalls: calls,
    modelContent: { role: "model", parts: calls.map((c) => ({ functionCall: c })) },
    usage,
  };
}

describe("sendJarvisMessage", () => {
  let ownerId: string;
  let viewerId: string;
  let threadId: string;
  let sessionId: string;

  beforeEach(async () => {
    await resetDb();
    vi.mocked(generateWithTools).mockReset();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const viewer = await db.user.create({ data: { email: "viewer@x.com", passwordHash: "x", name: "Viewer" } });
    ownerId = owner.id;
    viewerId = viewer.id;
    await loginAs(ownerId);
    const thread = await createThread({ name: "Q3 Report", categoryColor: "#f2c14e" });
    threadId = thread.id;
    await db.threadShare.create({ data: { threadId, sharedWithUserId: viewerId, permission: "VIEWER" } });
    const session = await db.jarvisSession.create({ data: { userId: ownerId } });
    sessionId = session.id;
  });
  afterAll(async () => db.$disconnect());

  it("persists the user message and a plain-text assistant reply when no tools are called", async () => {
    await loginAs(ownerId);
    vi.mocked(generateWithTools).mockResolvedValueOnce(textOnlyResponse("Sure, happy to help!"));

    const { userMessage, assistantMessage } = await sendJarvisMessage(sessionId, "hey there");

    expect(userMessage.role).toBe("USER");
    expect(userMessage.content).toBe("hey there");
    expect(assistantMessage.role).toBe("ASSISTANT");
    expect(assistantMessage.content).toBe("Sure, happy to help!");
    expect(assistantMessage.toolCalls).toBeNull();

    const stored = await db.jarvisMessage.findMany({ where: { sessionId } });
    expect(stored).toHaveLength(2);
  });

  it("creates a task via createTaskInThread and records a success chip", async () => {
    await loginAs(ownerId);
    vi.mocked(generateWithTools)
      .mockResolvedValueOnce(
        toolCallResponse([{ name: "createTaskInThread", args: { threadId, title: "Call the vendor" } }])
      )
      .mockResolvedValueOnce(textOnlyResponse("Created that task for you."));

    const { assistantMessage } = await sendJarvisMessage(sessionId, "call the vendor about the invoice");

    const tasks = await db.task.findMany({ where: { primaryThreadId: threadId } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Call the vendor");

    expect(assistantMessage.content).toBe("Created that task for you.");
    const toolCalls = assistantMessage.toolCalls as { tool: string; success: boolean; summary: string }[];
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toMatchObject({ tool: "createTaskInThread", success: true });
    expect(toolCalls[0].summary).toContain("Call the vendor");
    expect(toolCalls[0].summary).toContain("Q3 Report");
  });

  it("falls back to a chip-summary reply when the final round's text is empty", async () => {
    await loginAs(ownerId);
    vi.mocked(generateWithTools)
      .mockResolvedValueOnce(
        toolCallResponse([{ name: "createTaskInThread", args: { threadId, title: "Call the vendor" } }])
      )
      .mockResolvedValueOnce({ text: "", functionCalls: [], modelContent: { role: "model", parts: [] }, usage: ZERO_USAGE });

    const { assistantMessage } = await sendJarvisMessage(sessionId, "call the vendor about the invoice");

    expect(assistantMessage.content).toBeTruthy();
    expect(assistantMessage.content).not.toMatch(/something went wrong/i);
    const toolCalls = assistantMessage.toolCalls as { tool: string; success: boolean; summary: string }[];
    expect(toolCalls).toHaveLength(1);
    expect(assistantMessage.content).toContain(toolCalls[0].summary);
  });

  it("creates a new thread and task via createThreadWithTask", async () => {
    await loginAs(ownerId);
    vi.mocked(generateWithTools)
      .mockResolvedValueOnce(
        toolCallResponse([{ name: "createThreadWithTask", args: { threadName: "New Project", title: "Kick off" } }])
      )
      .mockResolvedValueOnce(textOnlyResponse("Started a new thread for that."));

    await sendJarvisMessage(sessionId, "start tracking the new project");

    const thread = await db.thread.findFirstOrThrow({ where: { name: "New Project" } });
    const tasks = await db.task.findMany({ where: { primaryThreadId: thread.id } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Kick off");
  });

  it("logs a comment via addTaskUpdate", async () => {
    await loginAs(ownerId);
    const task = await createTask({ primaryThreadId: threadId, title: "Call the vendor" });
    vi.mocked(generateWithTools)
      .mockResolvedValueOnce(
        toolCallResponse([{ name: "addTaskUpdate", args: { taskId: task.id, body: "Left a voicemail." } }])
      )
      .mockResolvedValueOnce(textOnlyResponse("Logged that."));

    await sendJarvisMessage(sessionId, "I left a voicemail for the vendor");

    const updates = await db.taskUpdate.findMany({ where: { taskId: task.id } });
    expect(updates).toHaveLength(1);
    expect(updates[0].body).toBe("Left a voicemail.");
  });

  it("updates status/priority via updateTaskFields", async () => {
    await loginAs(ownerId);
    const task = await createTask({ primaryThreadId: threadId, title: "Call the vendor" });
    vi.mocked(generateWithTools)
      .mockResolvedValueOnce(
        toolCallResponse([{ name: "updateTaskFields", args: { taskId: task.id, status: "DONE" } }])
      )
      .mockResolvedValueOnce(textOnlyResponse("Marked it done."));

    await sendJarvisMessage(sessionId, "finished the vendor call");

    const updated = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.workStatus).toBe("DONE");
  });

  it("updateTaskFields with neither status nor priority fails with a chip and makes no DB write", async () => {
    await loginAs(ownerId);
    const task = await createTask({ primaryThreadId: threadId, title: "Call the vendor" });
    vi.mocked(generateWithTools)
      .mockResolvedValueOnce(toolCallResponse([{ name: "updateTaskFields", args: { taskId: task.id } }]))
      .mockResolvedValueOnce(textOnlyResponse("I need a status or priority to update."));

    const { assistantMessage } = await sendJarvisMessage(sessionId, "update the vendor task");

    const unchanged = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(unchanged.workStatus).toBe(task.workStatus);
    expect(unchanged.priority).toBe(task.priority);

    const toolCalls = assistantMessage.toolCalls as { tool: string; success: boolean; summary: string }[];
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toMatchObject({ tool: "updateTaskFields", success: false });
  });

  it("resolves a task via findTasks before calling a write tool, in a second round", async () => {
    await loginAs(ownerId);
    const task = await createTask({ primaryThreadId: threadId, title: "Call the vendor about the invoice" });
    vi.mocked(generateWithTools)
      .mockResolvedValueOnce(toolCallResponse([{ name: "findTasks", args: { query: "vendor" } }]))
      .mockResolvedValueOnce(
        toolCallResponse([{ name: "updateTaskFields", args: { taskId: task.id, status: "DONE" } }])
      )
      .mockResolvedValueOnce(textOnlyResponse("Marked the vendor call done."));

    const { assistantMessage } = await sendJarvisMessage(sessionId, "finished the vendor thing");

    const updated = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.workStatus).toBe("DONE");
    const toolCalls = assistantMessage.toolCalls as { tool: string }[];
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].tool).toBe("updateTaskFields");
    expect(generateWithTools).toHaveBeenCalledTimes(3);
  });

  it("a tool call against a thread the user can't edit fails with a chip, not a thrown error", async () => {
    await loginAs(viewerId);
    const viewerSession = await db.jarvisSession.create({ data: { userId: viewerId } });
    vi.mocked(generateWithTools)
      .mockResolvedValueOnce(
        toolCallResponse([{ name: "createTaskInThread", args: { threadId, title: "Sneaky task" } }])
      )
      .mockResolvedValueOnce(textOnlyResponse("I couldn't do that — you only have view access there."));

    const { assistantMessage } = await sendJarvisMessage(viewerSession.id, "add a task to Q3 Report");

    const tasks = await db.task.findMany({ where: { primaryThreadId: threadId } });
    expect(tasks).toHaveLength(0);
    const toolCalls = assistantMessage.toolCalls as { tool: string; success: boolean }[];
    expect(toolCalls[0]).toMatchObject({ tool: "createTaskInThread", success: false });
  });

  it("stops the loop after 4 rounds and still returns a reply", async () => {
    await loginAs(ownerId);
    vi.mocked(generateWithTools)
      .mockResolvedValueOnce(toolCallResponse([{ name: "findTasks", args: { query: "x" } }]))
      .mockResolvedValueOnce(toolCallResponse([{ name: "findTasks", args: { query: "x" } }]))
      .mockResolvedValueOnce(toolCallResponse([{ name: "findTasks", args: { query: "x" } }]))
      .mockResolvedValueOnce(textOnlyResponse("I couldn't pin that down — could you clarify?"));

    const { assistantMessage } = await sendJarvisMessage(sessionId, "do something");

    expect(generateWithTools).toHaveBeenCalledTimes(4);
    expect(assistantMessage.content).toBe("I couldn't pin that down — could you clarify?");
    const roundOneConfig = vi.mocked(generateWithTools).mock.calls[0][2];
    const roundFourConfig = vi.mocked(generateWithTools).mock.calls[3][2];
    expect(roundOneConfig.tools).toBeDefined();
    expect(roundFourConfig.tools).toBeUndefined();
  });

  it("stops the loop after 4 rounds and summarizes accumulated actions when some succeeded", async () => {
    await loginAs(ownerId);
    const task = await createTask({ primaryThreadId: threadId, title: "Call the vendor" });
    vi.mocked(generateWithTools).mockResolvedValue(
      toolCallResponse([{ name: "updateTaskFields", args: { taskId: task.id, status: "DONE" } }])
    );

    const { assistantMessage } = await sendJarvisMessage(sessionId, "keep marking it done");

    expect(generateWithTools).toHaveBeenCalledTimes(4);
    expect(assistantMessage.content).not.toMatch(/wasn't able to finish/i);
    const occurrences = (assistantMessage.content.match(/Updated the task \(status → DONE\)/g) ?? []).length;
    expect(occurrences).toBe(4);
  });

  it("only sends the most recent 20 messages in this session as history to Gemini", async () => {
    await loginAs(ownerId);
    for (let i = 0; i < 25; i++) {
      await db.jarvisMessage.create({ data: { sessionId, userId: ownerId, role: "USER", content: `msg ${i}` } });
    }
    vi.mocked(generateWithTools).mockResolvedValueOnce(textOnlyResponse("ok"));

    await sendJarvisMessage(sessionId, "the newest message");

    const contentsArg = vi.mocked(generateWithTools).mock.calls[0][1];
    expect(contentsArg).toHaveLength(21);
    expect(contentsArg[0]?.parts?.[0]?.text).toBe("msg 5");
    expect(contentsArg[contentsArg.length - 1]?.parts?.[0]?.text).toBe("the newest message");
  });

  it("persists a visible error message, does not throw, and stores no token counts when the Gemini call itself fails", async () => {
    await loginAs(ownerId);
    vi.mocked(generateWithTools).mockRejectedValueOnce(new Error("network blip"));

    const { assistantMessage } = await sendJarvisMessage(sessionId, "hello");

    expect(assistantMessage.content).toMatch(/something went wrong/i);
    expect(assistantMessage.totalTokens).toBeNull();
    const stored = await db.jarvisMessage.findMany({ where: { sessionId } });
    expect(stored).toHaveLength(2);
  });

  it("sums token usage across every round of the loop onto the assistant message", async () => {
    await loginAs(ownerId);
    vi.mocked(generateWithTools)
      .mockResolvedValueOnce(
        toolCallResponse([{ name: "findTasks", args: { query: "x" } }], { promptTokenCount: 40, candidatesTokenCount: 10, totalTokenCount: 50 })
      )
      .mockResolvedValueOnce(
        textOnlyResponse("Done.", { promptTokenCount: 60, candidatesTokenCount: 15, totalTokenCount: 75 })
      );

    const { assistantMessage } = await sendJarvisMessage(sessionId, "find something");

    expect(assistantMessage.promptTokens).toBe(100);
    expect(assistantMessage.completionTokens).toBe(25);
    expect(assistantMessage.totalTokens).toBe(125);
  });

  it("sets the session's title from the first message, and does not overwrite it on the second", async () => {
    await loginAs(ownerId);
    vi.mocked(generateWithTools).mockResolvedValue(textOnlyResponse("ok"));

    await sendJarvisMessage(sessionId, "Start tracking Rocket Launch Prep");
    let session = await db.jarvisSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.title).toBe("Start tracking Rocket Launch Prep");

    await sendJarvisMessage(sessionId, "a second, unrelated message");
    session = await db.jarvisSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.title).toBe("Start tracking Rocket Launch Prep");
  });

  it("truncates a long first message to a title at a word boundary", async () => {
    await loginAs(ownerId);
    vi.mocked(generateWithTools).mockResolvedValue(textOnlyResponse("ok"));

    await sendJarvisMessage(
      sessionId,
      "This is a very long message that definitely exceeds the forty eight character auto title limit by a lot"
    );

    const session = await db.jarvisSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.title?.length).toBeLessThanOrEqual(49);
    expect(session.title?.endsWith("…")).toBe(true);
    expect(session.title).not.toMatch(/\s…$/);
  });

  it("rejects sending to a session owned by someone else", async () => {
    await loginAs(viewerId);
    await expect(sendJarvisMessage(sessionId, "hi")).rejects.toThrow(PermissionError);
  });

  it("requires being logged in", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(sendJarvisMessage(sessionId, "hi")).rejects.toThrow(PermissionError);
  });
});
