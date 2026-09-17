"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { generateWithTools } from "@/lib/gemini";
import { JARVIS_TOOLS } from "@/lib/jarvisTools";
import { getThreadsForJarvis } from "@/lib/jarvisContext";
import { buildJarvisSystemPrompt } from "@/lib/jarvisPrompt";
import { executeJarvisTool, type JarvisChipEntry } from "@/lib/jarvisDispatch";
import type { Content } from "@google/genai";
import type { JarvisMessage } from "@prisma/client";

const HISTORY_LIMIT = 20;
const MAX_TOOL_ROUNDS = 4;
const FALLBACK_ERROR_TEXT = "Something went wrong on my end — please try that again.";
const AUTO_TITLE_LENGTH = 48;

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new PermissionError("You must be logged in.");
  return session.user.id;
}

async function requireOwnJarvisSession(sessionId: string, userId: string) {
  const jarvisSession = await db.jarvisSession.findUniqueOrThrow({ where: { id: sessionId } });
  if (jarvisSession.userId !== userId) throw new PermissionError();
  return jarvisSession;
}

function toContent(message: { role: "USER" | "ASSISTANT"; content: string }): Content {
  return { role: message.role === "USER" ? "user" : "model", parts: [{ text: message.content }] };
}

// Truncates at a word boundary rather than mid-word, so an auto-title never
// ends on a fragment like "call the vend…" -- the trailing partial word is
// dropped instead of cut in half.
function autoTitleFrom(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= AUTO_TITLE_LENGTH) return trimmed;
  const truncated = trimmed.slice(0, AUTO_TITLE_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${(lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trimEnd()}…`;
}

export async function sendJarvisMessage(
  sessionId: string,
  content: string
): Promise<{ userMessage: JarvisMessage; assistantMessage: JarvisMessage }> {
  const userId = await requireUserId();
  const jarvisSession = await requireOwnJarvisSession(sessionId, userId);

  const userMessage = await db.jarvisMessage.create({
    data: { sessionId, userId, role: "USER", content },
  });

  const recentMessages = await db.jarvisMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT + 1,
  });
  const history = recentMessages.reverse();

  const threads = await getThreadsForJarvis(userId);
  const systemInstruction = buildJarvisSystemPrompt(threads);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

  let contents: Content[] = history.map(toContent);
  const chipLog: JarvisChipEntry[] = [];
  let finalText = "";
  // Summed across every round of this turn's tool-calling loop (up to
  // MAX_TOOL_ROUNDS Gemini calls) -- "what this reply cost" as a whole, not
  // any single round's number. Only persisted on the assistant message when
  // the loop actually completes (see `succeeded` below): a mid-loop failure
  // makes partial usage impossible to attribute honestly to "this reply".
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let succeeded = false;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const result = await generateWithTools(user.preferredAiModel, contents, {
        systemInstruction,
        tools: round === MAX_TOOL_ROUNDS - 1 ? undefined : JARVIS_TOOLS,
      });
      promptTokens += result.usage.promptTokenCount;
      completionTokens += result.usage.candidatesTokenCount;
      totalTokens += result.usage.totalTokenCount;
      contents = [...contents, result.modelContent];

      if (result.functionCalls.length === 0) {
        finalText = result.text || (chipLog.length > 0 ? `Done: ${chipLog.map((c) => c.summary).join("; ")}` : FALLBACK_ERROR_TEXT);
        break;
      }

      const responseParts = [];
      for (const call of result.functionCalls) {
        const dispatch = await executeJarvisTool(call, { userId, threads });
        if (dispatch.chipEntry) chipLog.push(dispatch.chipEntry);
        responseParts.push({ functionResponse: { name: call.name, response: dispatch.functionResponsePayload } });
      }
      contents = [...contents, { role: "user", parts: responseParts }];

      if (round === MAX_TOOL_ROUNDS - 1) {
        finalText =
          chipLog.length > 0
            ? `I took a few actions: ${chipLog.map((c) => c.summary).join("; ")}.`
            : "I wasn't able to finish that — could you rephrase?";
      }
    }
    succeeded = true;
  } catch {
    finalText = FALLBACK_ERROR_TEXT;
  }

  const assistantMessage = await db.jarvisMessage.create({
    data: {
      sessionId,
      userId,
      role: "ASSISTANT",
      content: finalText,
      toolCalls: chipLog.length > 0 ? chipLog : undefined,
      ...(succeeded ? { promptTokens, completionTokens, totalTokens } : {}),
    },
  });

  await db.jarvisSession.update({
    where: { id: sessionId },
    data: {
      updatedAt: new Date(),
      ...(jarvisSession.title === null ? { title: autoTitleFrom(content) } : {}),
    },
  });

  return { userMessage, assistantMessage };
}
