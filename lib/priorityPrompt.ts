export type CalibrationThread = { name: string; summary: string };

export function buildPriorityPrompt(
  task: { title: string; description: string; dueDate: Date | null },
  threadName: string,
  calibrationThreads: CalibrationThread[]
): string {
  const lines: string[] = [];

  lines.push(
    "You are helping prioritize a new task in a task-tracking app. Decide whether it is LOW, MEDIUM, or HIGH priority."
  );

  lines.push("", `New task (in thread "${threadName}"):`);
  lines.push(`Title: ${task.title}`);
  lines.push(`Description: ${task.description || "(none provided)"}`);
  lines.push(`Due date: ${task.dueDate ? task.dueDate.toISOString().slice(0, 10) : "(none set)"}`);

  if (calibrationThreads.length > 0) {
    lines.push(
      "",
      "For context, here is a summary of the user's other current work, to help calibrate relative urgency:"
    );
    for (const ct of calibrationThreads) {
      lines.push(`- Thread "${ct.name}": ${ct.summary}`);
    }
  }

  lines.push("", "Respond with exactly one word: LOW, MEDIUM, or HIGH. No other text.");
  return lines.join("\n");
}

export function parsePriorityResponse(text: string): "LOW" | "MEDIUM" | "HIGH" {
  const normalized = text.trim().toUpperCase();
  if (normalized === "LOW" || normalized === "MEDIUM" || normalized === "HIGH") {
    return normalized;
  }
  if (/\bHIGH\b/.test(normalized)) return "HIGH";
  if (/\bLOW\b/.test(normalized)) return "LOW";
  if (/\bMEDIUM\b/.test(normalized)) return "MEDIUM";
  return "MEDIUM";
}
