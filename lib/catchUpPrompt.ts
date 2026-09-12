import type { ThreadActivity } from "@/lib/threadActivity";

export function buildCatchUpPrompt(
  threadName: string,
  previousSummary: string | null,
  activity: ThreadActivity
): string {
  const lines: string[] = [];

  lines.push(
    `You maintain a running "catch-up" summary for a work thread called "${threadName}" in a task-tracking app. Someone is about to reopen this thread after being away. Write an updated summary that folds in the new activity below, so the summary always reflects where things currently stand. Keep it concise and written for someone resuming the work, not a changelog.`
  );

  if (previousSummary) {
    lines.push("", "Previous summary:", previousSummary);
  } else {
    lines.push("", "There is no previous summary yet — this is the first one for this thread.");
  }

  if (activity.tasks.length > 0) {
    lines.push("", "Tasks in this thread (current state):");
    for (const task of activity.tasks) {
      const marker = task.isNew ? "NEW" : "UPDATED";
      const due = task.dueDate ? `, due ${task.dueDate.toISOString().slice(0, 10)}` : "";
      lines.push(`- [${marker}] "${task.title}" — ${task.workStatus}, ${task.priority} priority${due}`);
    }
  }

  if (activity.updates.length > 0) {
    lines.push("", "New comments since the last summary:");
    for (const update of activity.updates) {
      lines.push(`- ${update.authorName} on "${update.taskTitle}": ${update.body}`);
    }
  }

  lines.push("", "Write only the updated summary text, with no preamble.");
  return lines.join("\n");
}
