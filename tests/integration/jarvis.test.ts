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

function textOnlyResponse(text: string) {
  return {
    text,
    functionCalls: [],
    modelContent: { role: "model", parts: [{ text }] },
  };
}

function toolCallResponse(calls: { name: string; args: Record<string, unknown> }[]) {
  return {
    text: "",
    functionCalls: calls,
    modelContent: { role: "model", parts: calls.map((c) => ({ functionCall: c })) },
  };
}

describe("sendJarvisMessage", () => {
  let ownerId: string;
  let viewerId: string;
  let threadId: string;

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
  });
  afterAll(async () => db.$disconnect());

  it("persists the user message and a plain-text assistant reply when no tools are called", async () => {
    await loginAs(ownerId);
    vi.mocked(generateWithTools).mockResolvedValueOnce(textOnlyResponse("Sure, happy to help!"));

    const { userMessage, assistantMessage } = await sendJarvisMessage("hey there");

    expect(userMessage.role).toBe("USER");
    expect(userMessage.content).toBe("hey there");
    expect(assistantMessage.role).toBe("ASSISTANT");
    expect(assistantMessage.content).toBe("Sure, happy to help!");
    expect(assistantMessage.toolCalls).toBeNull();

    const stored = await db.jarvisMessage.findMany({ where: { userId: ownerId } });
    expect(stored).toHaveLength(2);
  });

  it("creates a task via createTaskInThread and records a success chip", async () => {
    await loginAs(ownerId);
    vi.mocked(generateWithTools)
      .mockResolvedValueOnce(
        toolCallResponse([{ name: "createTaskInThread", args: { threadId, title: "Call the vendor" } }])
      )
      .mockResolvedValueOnce(textOnlyResponse("Created that task for you."));

    const { assistantMessage } = await sendJarvisMessage("call the vendor about the invoice");

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
      .mockResolvedValueOnce({ text: "", functionCalls: [], modelContent: { role: "model", parts: [] } });

    const { assistantMessage } = await sendJarvisMessage("call the vendor about the invoice");

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

    await sendJarvisMessage("start tracking the new project");

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

    await sendJarvisMessage("I left a voicemail for the vendor");

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

    await sendJarvisMessage("finished the vendor call");

    const updated = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.workStatus).toBe("DONE");
  });

  it("updateTaskFields with neither status nor priority fails with a chip and makes no DB write", async () => {
    await loginAs(ownerId);
    const task = await createTask({ primaryThreadId: threadId, title: "Call the vendor" });
    vi.mocked(generateWithTools)
      .mockResolvedValueOnce(toolCallResponse([{ name: "updateTaskFields", args: { taskId: task.id } }]))
      .mockResolvedValueOnce(textOnlyResponse("I need a status or priority to update."));

    const { assistantMessage } = await sendJarvisMessage("update the vendor task");

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

    const { assistantMessage } = await sendJarvisMessage("finished the vendor thing");

    const updated = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.workStatus).toBe("DONE");
    // findTasks itself must not produce a chip — only the write tool call does.
    const toolCalls = assistantMessage.toolCalls as { tool: string }[];
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].tool).toBe("updateTaskFields");
    expect(generateWithTools).toHaveBeenCalledTimes(3);
  });

  it("a tool call against a thread the user can't edit fails with a chip, not a thrown error", async () => {
    await loginAs(viewerId);
    vi.mocked(generateWithTools)
      .mockResolvedValueOnce(
        toolCallResponse([{ name: "createTaskInThread", args: { threadId, title: "Sneaky task" } }])
      )
      .mockResolvedValueOnce(textOnlyResponse("I couldn't do that — you only have view access there."));

    const { assistantMessage } = await sendJarvisMessage("add a task to Q3 Report");

    const tasks = await db.task.findMany({ where: { primaryThreadId: threadId } });
    expect(tasks).toHaveLength(0);
    const toolCalls = assistantMessage.toolCalls as { tool: string; success: boolean }[];
    expect(toolCalls[0]).toMatchObject({ tool: "createTaskInThread", success: false });
  });

  it("stops the loop after 4 rounds and still returns a reply", async () => {
    await loginAs(ownerId);
    // Rounds 1-3 keep calling tools. Tools are disabled on round 4, so a
    // realistic model can only reply with text at that point — the loop must
    // still terminate cleanly at exactly 4 calls, using that text reply.
    vi.mocked(generateWithTools)
      .mockResolvedValueOnce(toolCallResponse([{ name: "findTasks", args: { query: "x" } }]))
      .mockResolvedValueOnce(toolCallResponse([{ name: "findTasks", args: { query: "x" } }]))
      .mockResolvedValueOnce(toolCallResponse([{ name: "findTasks", args: { query: "x" } }]))
      .mockResolvedValueOnce(textOnlyResponse("I couldn't pin that down — could you clarify?"));

    const { assistantMessage } = await sendJarvisMessage("do something");

    expect(generateWithTools).toHaveBeenCalledTimes(4);
    expect(assistantMessage.content).toBe("I couldn't pin that down — could you clarify?");
    // The behavior this whole test is about: tools must actually be omitted
    // on the final round (so a real model can only reply with text), not
    // just coincidentally return text in the mock.
    const roundOneConfig = vi.mocked(generateWithTools).mock.calls[0][2];
    const roundFourConfig = vi.mocked(generateWithTools).mock.calls[3][2];
    expect(roundOneConfig.tools).toBeDefined();
    expect(roundFourConfig.tools).toBeUndefined();
  });

  it("stops the loop after 4 rounds and summarizes accumulated actions when some succeeded", async () => {
    await loginAs(ownerId);
    const task = await createTask({ primaryThreadId: threadId, title: "Call the vendor" });
    // Every round returns a write tool call that succeeds, never plain text —
    // this is a deliberately misbehaving mock (tools are disabled on round 4
    // in the real request, so a real model couldn't do this) exercising the
    // defensive round-cap fallback: even if a call anomalously returns a
    // function call on the last round, the fallback must summarize the
    // accumulated chip log rather than claim nothing happened.
    vi.mocked(generateWithTools).mockResolvedValue(
      toolCallResponse([{ name: "updateTaskFields", args: { taskId: task.id, status: "DONE" } }])
    );

    const { assistantMessage } = await sendJarvisMessage("keep marking it done");

    expect(generateWithTools).toHaveBeenCalledTimes(4);
    expect(assistantMessage.content).not.toMatch(/wasn't able to finish/i);
    const occurrences = (assistantMessage.content.match(/Updated the task \(status → DONE\)/g) ?? []).length;
    expect(occurrences).toBe(4);
  });

  it("only sends the most recent 20 messages as history to Gemini", async () => {
    await loginAs(ownerId);
    for (let i = 0; i < 25; i++) {
      await db.jarvisMessage.create({ data: { userId: ownerId, role: "USER", content: `msg ${i}` } });
    }
    vi.mocked(generateWithTools).mockResolvedValueOnce(textOnlyResponse("ok"));

    await sendJarvisMessage("the newest message");

    const contentsArg = vi.mocked(generateWithTools).mock.calls[0][1];
    // 20 prior + the just-persisted new one = 21 total turns sent.
    expect(contentsArg).toHaveLength(21);
    // Oldest included message first, newest (the just-sent one) last — proves
    // correct selection AND correct ordering, not just correct count.
    expect(contentsArg[0]?.parts?.[0]?.text).toBe("msg 5");
    expect(contentsArg[contentsArg.length - 1]?.parts?.[0]?.text).toBe("the newest message");
  });

  it("persists a visible error message and does not throw when the Gemini call itself fails", async () => {
    await loginAs(ownerId);
    vi.mocked(generateWithTools).mockRejectedValueOnce(new Error("network blip"));

    const { assistantMessage } = await sendJarvisMessage("hello");

    expect(assistantMessage.content).toMatch(/something went wrong/i);
    const stored = await db.jarvisMessage.findMany({ where: { userId: ownerId } });
    expect(stored).toHaveLength(2);
  });

  it("requires being logged in", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(sendJarvisMessage("hi")).rejects.toThrow(PermissionError);
  });
});
