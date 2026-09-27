import type { Priority, WorkStatus } from "./clusterLayout";

export type ThreadTaskSummary = { high: number; medium: number; low: number; done: number; total: number };

// Priority counts cover unfinished tasks only; DONE tasks are counted
// separately (they drive the progress ring, not the "!" rows).
export function summarizeThread(tasks: { priority: Priority; workStatus: WorkStatus }[]): ThreadTaskSummary {
  const summary: ThreadTaskSummary = { high: 0, medium: 0, low: 0, done: 0, total: tasks.length };
  for (const t of tasks) {
    if (t.workStatus === "DONE") summary.done++;
    else if (t.priority === "HIGH") summary.high++;
    else if (t.priority === "MEDIUM") summary.medium++;
    else summary.low++;
  }
  return summary;
}

export function threadAriaLabel(name: string, s: ThreadTaskSummary): string {
  if (s.total === 0) return `${name} — no tasks. Open thread`;
  return `${name} — ${s.high} high, ${s.medium} medium, ${s.low} low open, ${s.done} done. Open thread`;
}

export function taskAriaLabel(task: { title: string; priority: Priority; workStatus: WorkStatus }): string {
  const status = task.workStatus === "IN_PROGRESS" ? ", in progress" : task.workStatus === "DONE" ? ", done" : "";
  return `${task.title}, ${task.priority.toLowerCase()} priority${status}`;
}

const MARKS = { HIGH: "!!!", MEDIUM: "!!", LOW: "!" } as const;

export function priorityMarks(priority: Priority) {
  return MARKS[priority];
}
