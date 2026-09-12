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

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new PermissionError("You must be logged in.");
  return session.user.id;
}

function toContent(message: { role: "USER" | "ASSISTANT"; content: string }): Content {
  return { role: message.role === "USER" ? "user" : "model", parts: [{ text: message.content }] };
}

export async function sendJarvisMessage(
  content: string
): Promise<{ userMessage: JarvisMessage; assistantMessage: JarvisMessage }> {
  const userId = await requireUserId();

  const userMessage = await db.jarvisMessage.create({
    data: { userId, role: "USER", content },
  });

  const recentMessages = await db.jarvisMessage.findMany({
    where: { userId },
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

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const result = await generateWithTools(user.preferredAiModel, contents, {
        systemInstruction,
        tools: JARVIS_TOOLS,
      });
      contents = [...contents, result.modelContent];

      if (result.functionCalls.length === 0) {
        finalText = result.text;
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
  } catch {
    finalText = FALLBACK_ERROR_TEXT;
  }

  const assistantMessage = await db.jarvisMessage.create({
    data: {
      userId,
      role: "ASSISTANT",
      content: finalText,
      toolCalls: chipLog.length > 0 ? chipLog : undefined,
    },
  });

  return { userMessage, assistantMessage };
}
