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

function errorMessage(err: unknown, toolName: string): string {
  if (err instanceof PermissionError) return err.message;
  console.error(`[jarvis:${toolName}]`, err);
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
        await suggestTaskPriority(task.id).catch(() => {});
        const summary = `Created task "${title}" in ${threadName}`;
        return { functionResponsePayload: { output: { taskId: task.id } }, chipEntry: { tool: "createTaskInThread", success: true, summary } };
      } catch (err) {
        const message = errorMessage(err, "createTaskInThread");
        const summary = `Couldn't create the task in ${threadName} — ${message}`;
        return { functionResponsePayload: { error: { message } }, chipEntry: { tool: "createTaskInThread", success: false, summary } };
      }
    }

    case "createThreadWithTask": {
      const threadName = args.threadName as string;
      const title = args.title as string;
      let thread;
      try {
        thread = await createThread({
          name: threadName,
          categoryColor: (args.categoryColor as string | undefined) ?? DEFAULT_THREAD_COLOR,
        });
      } catch (err) {
        const message = errorMessage(err, "createThreadWithTask");
        const summary = `Couldn't create thread "${threadName}" — ${message}`;
        return { functionResponsePayload: { error: { message } }, chipEntry: { tool: "createThreadWithTask", success: false, summary } };
      }
      try {
        const task = await createTask({
          primaryThreadId: thread.id,
          title,
          description: (args.description as string | undefined) ?? undefined,
          dueDate: args.dueDate ? new Date(args.dueDate as string) : undefined,
        });
        await suggestTaskPriority(task.id).catch(() => {});
        const summary = `Created new thread "${threadName}" with task "${title}"`;
        return {
          functionResponsePayload: { output: { threadId: thread.id, taskId: task.id } },
          chipEntry: { tool: "createThreadWithTask", success: true, summary },
        };
      } catch (err) {
        const message = errorMessage(err, "createThreadWithTask");
        const summary = `Created thread "${threadName}", but couldn't add the task "${title}" to it — ${message}`;
        return {
          functionResponsePayload: {
            error: { message: `Thread was created (id ${thread.id}), but the task failed: ${message}` },
          },
          chipEntry: { tool: "createThreadWithTask", success: false, summary },
        };
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
        const message = errorMessage(err, "addTaskUpdate");
        const summary = `Couldn't log that update — ${message}`;
        return { functionResponsePayload: { error: { message } }, chipEntry: { tool: "addTaskUpdate", success: false, summary } };
      }
    }

    case "updateTaskFields": {
      const taskId = args.taskId as string;
      const status = args.status as "TODO" | "IN_PROGRESS" | "DONE" | undefined;
      const priority = args.priority as "LOW" | "MEDIUM" | "HIGH" | undefined;
      if (!status && !priority) {
        return {
          functionResponsePayload: { error: { message: "You must specify a status or priority to update." } },
          chipEntry: { tool: "updateTaskFields", success: false, summary: "No status or priority was specified, so nothing was updated." },
        };
      }
      try {
        const patch: { workStatus?: "TODO" | "IN_PROGRESS" | "DONE"; priority?: "LOW" | "MEDIUM" | "HIGH" } = {};
        if (status) patch.workStatus = status;
        if (priority) patch.priority = priority;
        await updateTask(taskId, patch);
        const changes = [status && `status → ${status}`, priority && `priority → ${priority}`].filter(Boolean).join(", ");
        const summary = `Updated the task (${changes || "no changes"})`;
        return { functionResponsePayload: { output: { taskId } }, chipEntry: { tool: "updateTaskFields", success: true, summary } };
      } catch (err) {
        const message = errorMessage(err, "updateTaskFields");
        const summary = `Couldn't update that task — ${message}`;
        return { functionResponsePayload: { error: { message } }, chipEntry: { tool: "updateTaskFields", success: false, summary } };
      }
    }

    case "findTasks": {
      const query = args.query as string;
      try {
        const matches = await findTasksForJarvis(ctx.userId, query);
        return { functionResponsePayload: { output: { matches } }, chipEntry: null };
      } catch (err) {
        return { functionResponsePayload: { error: { message: errorMessage(err, "findTasks") } }, chipEntry: null };
      }
    }

    default:
      return {
        functionResponsePayload: { error: { message: `Unknown tool: ${call.name}` } },
        chipEntry: null,
      };
  }
}
