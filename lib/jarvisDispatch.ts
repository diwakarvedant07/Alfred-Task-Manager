import type { FunctionCall } from "@google/genai";
import { PermissionError } from "@/lib/permissions";
import { createTask, updateTask } from "@/app/actions/tasks";
import { createThread } from "@/app/actions/threads";
import { addTaskUpdate } from "@/app/actions/taskUpdates";
import { suggestTaskPriority } from "@/app/actions/taskPriority";
import type { JarvisThreadContext } from "@/lib/jarvisContext";
import { findTasksForJarvis } from "@/lib/jarvisContext";

export type JarvisChipEntry = { tool: string; success: boolean; summary: string };

export type JarvisDispatchResult = {
  functionResponsePayload: Record<string, unknown>;
  chipEntry: JarvisChipEntry | null;
};

const DEFAULT_THREAD_COLOR = "#38e0ff";

function errorMessage(err: unknown): string {
  if (err instanceof PermissionError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

export async function executeJarvisTool(
  call: FunctionCall,
  ctx: { userId: string; threads: JarvisThreadContext[] }
): Promise<JarvisDispatchResult> {
  const args = call.args ?? {};

  switch (call.name) {
    case "createTaskInThread": {
      const threadId = args.threadId as string;
      const title = args.title as string;
      const threadName = ctx.threads.find((t) => t.id === threadId)?.name ?? "that thread";
      try {
        const task = await createTask({
          primaryThreadId: threadId,
          title,
          description: (args.description as string | undefined) ?? undefined,
          dueDate: args.dueDate ? new Date(args.dueDate as string) : undefined,
        });
        void suggestTaskPriority(task.id).catch(() => {});
        const summary = `Created task "${title}" in ${threadName}`;
        return { functionResponsePayload: { output: { taskId: task.id } }, chipEntry: { tool: "createTaskInThread", success: true, summary } };
      } catch (err) {
        const summary = `Couldn't create the task in ${threadName} — ${errorMessage(err)}`;
        return { functionResponsePayload: { error: { message: errorMessage(err) } }, chipEntry: { tool: "createTaskInThread", success: false, summary } };
      }
    }

    case "createThreadWithTask": {
      const threadName = args.threadName as string;
      const title = args.title as string;
      try {
        const thread = await createThread({
          name: threadName,
          categoryColor: (args.categoryColor as string | undefined) ?? DEFAULT_THREAD_COLOR,
        });
        const task = await createTask({
          primaryThreadId: thread.id,
          title,
          description: (args.description as string | undefined) ?? undefined,
          dueDate: args.dueDate ? new Date(args.dueDate as string) : undefined,
        });
        void suggestTaskPriority(task.id).catch(() => {});
        const summary = `Created new thread "${threadName}" with task "${title}"`;
        return {
          functionResponsePayload: { output: { threadId: thread.id, taskId: task.id } },
          chipEntry: { tool: "createThreadWithTask", success: true, summary },
        };
      } catch (err) {
        const summary = `Couldn't create thread "${threadName}" — ${errorMessage(err)}`;
        return { functionResponsePayload: { error: { message: errorMessage(err) } }, chipEntry: { tool: "createThreadWithTask", success: false, summary } };
      }
    }

    case "addTaskUpdate": {
      const taskId = args.taskId as string;
      const body = args.body as string;
      try {
        await addTaskUpdate(taskId, body);
        const summary = `Logged an update on the task`;
        return { functionResponsePayload: { output: { taskId } }, chipEntry: { tool: "addTaskUpdate", success: true, summary } };
      } catch (err) {
        const summary = `Couldn't log that update — ${errorMessage(err)}`;
        return { functionResponsePayload: { error: { message: errorMessage(err) } }, chipEntry: { tool: "addTaskUpdate", success: false, summary } };
      }
    }

    case "updateTaskFields": {
      const taskId = args.taskId as string;
      const status = args.status as "TODO" | "IN_PROGRESS" | "DONE" | undefined;
      const priority = args.priority as "LOW" | "MEDIUM" | "HIGH" | undefined;
      try {
        const patch: { workStatus?: "TODO" | "IN_PROGRESS" | "DONE"; priority?: "LOW" | "MEDIUM" | "HIGH" } = {};
        if (status) patch.workStatus = status;
        if (priority) patch.priority = priority;
        await updateTask(taskId, patch);
        const changes = [status && `status → ${status}`, priority && `priority → ${priority}`].filter(Boolean).join(", ");
        const summary = `Updated the task (${changes || "no changes"})`;
        return { functionResponsePayload: { output: { taskId } }, chipEntry: { tool: "updateTaskFields", success: true, summary } };
      } catch (err) {
        const summary = `Couldn't update that task — ${errorMessage(err)}`;
        return { functionResponsePayload: { error: { message: errorMessage(err) } }, chipEntry: { tool: "updateTaskFields", success: false, summary } };
      }
    }

    case "findTasks": {
      const query = args.query as string;
      try {
        const matches = await findTasksForJarvis(ctx.userId, query);
        return { functionResponsePayload: { output: { matches } }, chipEntry: null };
      } catch (err) {
        return { functionResponsePayload: { error: { message: errorMessage(err) } }, chipEntry: null };
      }
    }

    default:
      return {
        functionResponsePayload: { error: { message: `Unknown tool: ${call.name}` } },
        chipEntry: null,
      };
  }
}
