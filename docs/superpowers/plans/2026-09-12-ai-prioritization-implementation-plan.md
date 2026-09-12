# AI-Assisted Prioritization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build sub-project 3 of Arc — when a task is created, the AI suggests a priority for it (calibrated against the user's other threads' existing rolling AI summaries), applied moments after creation without blocking it, and visibly marked as an AI suggestion until the user manually overrides it.

**Architecture:** Task creation stays synchronous and fast; a separate, client-fired-but-unawaited Server Action performs the AI call and updates the task afterward, surfaced through the same per-task local-override mechanism the canvas already uses for instant-feeling edits. A new `priorityIsAiSuggested` column tracks provenance; any manual priority edit clears it.

**Tech Stack:** Everything already in the codebase — no new dependencies. Reuses `lib/gemini.ts`'s `generateText` and each user's own `preferredAiModel` from sub-project 2.

## Global Constraints

- `createTask` itself is never modified to call the AI — task creation must stay exactly as fast as it is today.
- The AI call happens via a separate `suggestTaskPriority(taskId)` Server Action, called by the client without being awaited before the UI moves on.
- A failed or malformed AI response must never surface an error to the user and must never leave a task without a valid priority — fall back to `MEDIUM`.
- Calibration context is built from up to 10 of the user's other `ACTIVE` threads that already have a `ThreadSummary`, most-recently-updated first — never a fresh raw-task-list query of those other threads.
- `priorityIsAiSuggested` is set to `true` only by `suggestTaskPriority`, and cleared to `false` by `updateTask` whenever its patch includes a `priority` field at all.
- Every task ends with a passing test run and a commit before moving to the next task. No test may call the real Gemini API — mock `@/lib/gemini` in every test that would otherwise trigger it.

---

## File Structure

```
prisma/
  schema.prisma                       # + Task.priorityIsAiSuggested
lib/
  priorityPrompt.ts                   # buildPriorityPrompt, parsePriorityResponse
  threadCalibration.ts                # getCalibrationThreadSummaries (DB query)
app/actions/
  taskPriority.ts                     # suggestTaskPriority
  tasks.ts                            # modified: updateTask clears the flag
components/
  canvas/NewTaskButton.tsx            # modified: + description, due date fields
  canvas/TaskNode.tsx                 # modified: + AI badge
  canvas/Canvas.tsx                   # modified: fire-and-forget wiring
  task-detail/TaskDetailPanel.tsx     # modified: + AI badge
app/canvas/page.tsx                   # modified: thread priorityIsAiSuggested through
tests/
  unit/priorityPrompt.test.ts
  integration/threadCalibration.test.ts
  integration/taskPriority.test.ts
  integration/tasks-priority-flag.test.ts
  component/NewTaskButton.test.tsx    # extended
  component/TaskNode.test.tsx         # extended
  component/TaskDetailPanel.test.tsx  # extended
  component/Canvas.test.tsx           # extended
  e2e/ai-prioritization-flow.spec.ts
```

---

### Task 1: Schema — `Task.priorityIsAiSuggested`

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `tests/integration/schema-priority.test.ts`

**Interfaces:**
- Produces: `Task.priorityIsAiSuggested: Boolean` (default `false`).

- [ ] **Step 1: Read the current schema and add the field**

Read `prisma/schema.prisma` first. In `model Task { ... }`, add `priorityIsAiSuggested` right after `priority`:

```prisma
model Task {
  id              String               @id @default(cuid())
  primaryThreadId String
  primaryThread   Thread               @relation("PrimaryThread", fields: [primaryThreadId], references: [id])
  title           String
  description     String               @default("")
  workStatus      TaskWorkStatus       @default(TODO)
  priority        TaskPriority         @default(MEDIUM)
  priorityIsAiSuggested Boolean        @default(false)
  dueDate         DateTime?
  lifecycleStatus TaskLifecycleStatus  @default(ACTIVE)
  deletedAt       DateTime?
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt

  secondaryThreadLinks TaskThreadLink[]
  updates              TaskUpdate[]
  positions            TaskPosition[]

  @@index([primaryThreadId, lifecycleStatus])
}
```

(Keep every other field/relation on `Task` exactly as it currently is — only the new column is added. If the live file's `Task` model has additional fields beyond what's shown here from later fixes, preserve them; add `priorityIsAiSuggested` alongside `priority` regardless.)

- [ ] **Step 2: Run the migration**

```bash
npx prisma migrate dev --name add_task_priority_ai_suggested
```

Expected: migration applies cleanly, `@prisma/client` regenerates with no type errors. Run `npx prisma generate` explicitly afterward if the new field isn't yet available on the client (a known quirk in this repo's Prisma 7 setup).

- [ ] **Step 3: Write the failing integration test**

`tests/integration/schema-priority.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";

describe("Task.priorityIsAiSuggested", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  it("defaults to false on a new task", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "Ada" } });
    const thread = await db.thread.create({ data: { ownerId: user.id, name: "Q3 Report", categoryColor: "#f2c14e" } });
    const task = await db.task.create({ data: { primaryThreadId: thread.id, title: "Draft summary" } });

    expect(task.priorityIsAiSuggested).toBe(false);
  });

  it("can be set to true explicitly", async () => {
    const user = await db.user.create({ data: { email: "b@x.com", passwordHash: "x", name: "Bo" } });
    const thread = await db.thread.create({ data: { ownerId: user.id, name: "Thread", categoryColor: "#38e0ff" } });
    const task = await db.task.create({
      data: { primaryThreadId: thread.id, title: "Task", priorityIsAiSuggested: true },
    });

    expect(task.priorityIsAiSuggested).toBe(true);
  });
});
```

Run: `npm test -- schema-priority.test.ts`
Expected: PASS immediately (verifies the schema/migration from Steps 1-2; if it fails, fix the schema before continuing).

- [ ] **Step 4: Commit**

```bash
git add prisma tests/integration/schema-priority.test.ts
git commit -m "feat: add Task.priorityIsAiSuggested"
```

---

### Task 2: Priority prompt builder and response parser

**Files:**
- Create: `lib/priorityPrompt.ts`, `tests/unit/priorityPrompt.test.ts`

**Interfaces:**
- Consumes: nothing (pure functions).
- Produces: `type CalibrationThread = { name: string; summary: string }`; `buildPriorityPrompt(task: { title: string; description: string; dueDate: Date | null }, threadName: string, calibrationThreads: CalibrationThread[]): string`; `parsePriorityResponse(text: string): "LOW" | "MEDIUM" | "HIGH"`.

- [ ] **Step 1: Write the failing test**

`tests/unit/priorityPrompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPriorityPrompt, parsePriorityResponse } from "@/lib/priorityPrompt";

describe("buildPriorityPrompt", () => {
  it("includes the task's title, description, and due date", () => {
    const prompt = buildPriorityPrompt(
      { title: "Fix login bug", description: "Users can't sign in on mobile.", dueDate: new Date("2026-04-01") },
      "Q3 Report",
      []
    );
    expect(prompt).toContain("Fix login bug");
    expect(prompt).toContain("Users can't sign in on mobile.");
    expect(prompt).toContain("2026-04-01");
    expect(prompt).toContain("Q3 Report");
  });

  it("notes when there is no description or due date", () => {
    const prompt = buildPriorityPrompt({ title: "Task", description: "", dueDate: null }, "Thread", []);
    expect(prompt).toContain("(none provided)");
    expect(prompt).toContain("(none set)");
  });

  it("includes calibration thread summaries when provided", () => {
    const prompt = buildPriorityPrompt(
      { title: "Task", description: "", dueDate: null },
      "Thread",
      [{ name: "Client Launch", summary: "Waiting on legal sign-off, blocking release." }]
    );
    expect(prompt).toContain("Client Launch");
    expect(prompt).toContain("Waiting on legal sign-off, blocking release.");
  });

  it("says to respond with exactly one word", () => {
    const prompt = buildPriorityPrompt({ title: "Task", description: "", dueDate: null }, "Thread", []);
    expect(prompt).toContain("Respond with exactly one word: LOW, MEDIUM, or HIGH");
  });
});

describe("parsePriorityResponse", () => {
  it("matches exact tokens case-insensitively", () => {
    expect(parsePriorityResponse("HIGH")).toBe("HIGH");
    expect(parsePriorityResponse("low")).toBe("LOW");
    expect(parsePriorityResponse("Medium")).toBe("MEDIUM");
  });

  it("trims surrounding whitespace", () => {
    expect(parsePriorityResponse("  HIGH  \n")).toBe("HIGH");
  });

  it("finds a valid token even with stray extra text", () => {
    expect(parsePriorityResponse("I'd say HIGH priority.")).toBe("HIGH");
  });

  it("falls back to MEDIUM for anything unparseable", () => {
    expect(parsePriorityResponse("")).toBe("MEDIUM");
    expect(parsePriorityResponse("I'm not sure.")).toBe("MEDIUM");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- priorityPrompt.test.ts`
Expected: FAIL with "Cannot find module '@/lib/priorityPrompt'"

- [ ] **Step 3: Write the implementation**

`lib/priorityPrompt.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- priorityPrompt.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/priorityPrompt.ts tests/unit/priorityPrompt.test.ts
git commit -m "feat: add priority prompt builder and response parser"
```

---

### Task 3: Cross-thread calibration query

**Files:**
- Create: `lib/threadCalibration.ts`, `tests/integration/threadCalibration.test.ts`

**Interfaces:**
- Consumes: `db` from `lib/db.ts`; `CalibrationThread` type (Task 2).
- Produces: `getCalibrationThreadSummaries(userId: string, excludeThreadId: string): Promise<CalibrationThread[]>`.

- [ ] **Step 1: Write the failing test**

`tests/integration/threadCalibration.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { getCalibrationThreadSummaries } from "@/lib/threadCalibration";

describe("getCalibrationThreadSummaries", () => {
  let ownerId: string;
  let collaboratorId: string;

  beforeEach(async () => {
    await resetDb();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const collaborator = await db.user.create({ data: { email: "collab@x.com", passwordHash: "x", name: "Collab" } });
    ownerId = owner.id;
    collaboratorId = collaborator.id;
  });
  afterAll(async () => db.$disconnect());

  it("excludes the given thread and threads with no summary", async () => {
    const excluded = await db.thread.create({ data: { ownerId, name: "Excluded", categoryColor: "#f2c14e" } });
    await db.threadSummary.create({ data: { threadId: excluded.id, summaryText: "Should not appear.", lastIncludedAt: new Date() } });

    const noSummary = await db.thread.create({ data: { ownerId, name: "No Summary Yet", categoryColor: "#38e0ff" } });
    void noSummary;

    const withSummary = await db.thread.create({ data: { ownerId, name: "Client Launch", categoryColor: "#ff5fa8" } });
    await db.threadSummary.create({ data: { threadId: withSummary.id, summaryText: "Waiting on legal sign-off.", lastIncludedAt: new Date() } });

    const results = await getCalibrationThreadSummaries(ownerId, excluded.id);

    expect(results).toEqual([{ name: "Client Launch", summary: "Waiting on legal sign-off." }]);
  });

  it("includes threads shared with the user, not just owned ones", async () => {
    const ownedThread = await db.thread.create({ data: { ownerId, name: "Mine", categoryColor: "#f2c14e" } });
    void ownedThread;
    const sharedThread = await db.thread.create({ data: { ownerId, name: "Shared With Me", categoryColor: "#38e0ff" } });
    await db.threadShare.create({ data: { threadId: sharedThread.id, sharedWithUserId: collaboratorId, permission: "VIEWER" } });
    await db.threadSummary.create({ data: { threadId: sharedThread.id, summaryText: "Shared thread summary.", lastIncludedAt: new Date() } });

    const results = await getCalibrationThreadSummaries(collaboratorId, "some-other-thread-id");

    expect(results).toEqual([{ name: "Shared With Me", summary: "Shared thread summary." }]);
  });

  it("excludes ARCHIVED and DELETED threads", async () => {
    const archived = await db.thread.create({ data: { ownerId, name: "Archived", categoryColor: "#f2c14e", status: "ARCHIVED" } });
    await db.threadSummary.create({ data: { threadId: archived.id, summaryText: "Archived summary.", lastIncludedAt: new Date() } });

    const results = await getCalibrationThreadSummaries(ownerId, "some-other-thread-id");

    expect(results).toEqual([]);
  });

  it("orders by most-recently-updated summary first and caps at 10", async () => {
    for (let i = 0; i < 12; i++) {
      const thread = await db.thread.create({ data: { ownerId, name: `Thread ${i}`, categoryColor: "#f2c14e" } });
      await db.threadSummary.create({ data: { threadId: thread.id, summaryText: `Summary ${i}`, lastIncludedAt: new Date() } });
      await new Promise((r) => setTimeout(r, 5));
    }

    const results = await getCalibrationThreadSummaries(ownerId, "some-other-thread-id");

    expect(results).toHaveLength(10);
    expect(results[0].name).toBe("Thread 11");
    expect(results[9].name).toBe("Thread 2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- threadCalibration.test.ts`
Expected: FAIL with "Cannot find module '@/lib/threadCalibration'"

- [ ] **Step 3: Write the implementation**

`lib/threadCalibration.ts`:

```ts
import { db } from "@/lib/db";
import type { CalibrationThread } from "@/lib/priorityPrompt";

export async function getCalibrationThreadSummaries(
  userId: string,
  excludeThreadId: string
): Promise<CalibrationThread[]> {
  const ownedThreads = await db.thread.findMany({
    where: { ownerId: userId, status: "ACTIVE" },
    select: { id: true },
  });
  const sharedThreadIds = (
    await db.threadShare.findMany({ where: { sharedWithUserId: userId }, select: { threadId: true } })
  ).map((s) => s.threadId);
  const sharedThreads = await db.thread.findMany({
    where: { id: { in: sharedThreadIds }, status: "ACTIVE" },
    select: { id: true },
  });

  const threadIds = [...ownedThreads.map((t) => t.id), ...sharedThreads.map((t) => t.id)].filter(
    (id) => id !== excludeThreadId
  );

  const summaries = await db.threadSummary.findMany({
    where: { threadId: { in: threadIds } },
    include: { thread: true },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  return summaries.map((s) => ({ name: s.thread.name, summary: s.summaryText }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- threadCalibration.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/threadCalibration.ts tests/integration/threadCalibration.test.ts
git commit -m "feat: add cross-thread calibration query for priority suggestions"
```

---

### Task 4: `suggestTaskPriority` Server Action

**Files:**
- Create: `app/actions/taskPriority.ts`, `tests/integration/taskPriority.test.ts`

**Interfaces:**
- Consumes: `db`, `auth()`, `resolveThreadRole`, `canManageTasks`, `PermissionError` (Foundation); `getCalibrationThreadSummaries` (Task 3); `buildPriorityPrompt`, `parsePriorityResponse` (Task 2); `generateText` (sub-project 2's `lib/gemini.ts`).
- Produces: `suggestTaskPriority(taskId: string): Promise<Task>`.

- [ ] **Step 1: Write the failing test**

`tests/integration/taskPriority.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { createThread } from "@/app/actions/threads";
import { createTask } from "@/app/actions/tasks";
import { PermissionError } from "@/lib/permissions";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

vi.mock("@/lib/gemini", () => ({ generateText: vi.fn() }));
import { generateText } from "@/lib/gemini";

import { suggestTaskPriority } from "@/app/actions/taskPriority";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("suggestTaskPriority", () => {
  let ownerId: string;
  let viewerId: string;
  let threadId: string;
  let taskId: string;

  beforeEach(async () => {
    await resetDb();
    vi.mocked(generateText).mockReset();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const viewer = await db.user.create({ data: { email: "viewer@x.com", passwordHash: "x", name: "Viewer" } });
    ownerId = owner.id;
    viewerId = viewer.id;

    await loginAs(ownerId);
    const thread = await createThread({ name: "Q3 Report", categoryColor: "#f2c14e" });
    threadId = thread.id;
    await db.threadShare.create({ data: { threadId, sharedWithUserId: viewerId, permission: "VIEWER" } });
    const task = await createTask({
      primaryThreadId: threadId,
      title: "Fix login bug",
      description: "Users can't sign in on mobile.",
    });
    taskId = task.id;
  });
  afterAll(async () => db.$disconnect());

  it("sets the task's priority from the AI response and marks it AI-suggested", async () => {
    await loginAs(ownerId);
    vi.mocked(generateText).mockResolvedValue("HIGH");

    const updated = await suggestTaskPriority(taskId);

    expect(updated.priority).toBe("HIGH");
    expect(updated.priorityIsAiSuggested).toBe(true);
  });

  it("falls back to MEDIUM when the AI response is unparseable", async () => {
    await loginAs(ownerId);
    vi.mocked(generateText).mockResolvedValue("uh, not sure honestly");

    const updated = await suggestTaskPriority(taskId);

    expect(updated.priority).toBe("MEDIUM");
    expect(updated.priorityIsAiSuggested).toBe(true);
  });

  it("uses the calling user's preferredAiModel", async () => {
    await loginAs(ownerId);
    await db.user.update({ where: { id: ownerId }, data: { preferredAiModel: "gemini-2.5-flash" } });
    vi.mocked(generateText).mockResolvedValue("LOW");

    await suggestTaskPriority(taskId);

    expect(generateText).toHaveBeenCalledWith("gemini-2.5-flash", expect.any(String));
  });

  it("includes calibration context from other threads' summaries in the prompt", async () => {
    await loginAs(ownerId);
    const otherThread = await createThread({ name: "Client Launch", categoryColor: "#38e0ff" });
    await db.threadSummary.create({
      data: { threadId: otherThread.id, summaryText: "Waiting on legal sign-off.", lastIncludedAt: new Date() },
    });
    vi.mocked(generateText).mockResolvedValue("HIGH");

    await suggestTaskPriority(taskId);

    const promptArg = vi.mocked(generateText).mock.calls[0][1];
    expect(promptArg).toContain("Client Launch");
    expect(promptArg).toContain("Waiting on legal sign-off.");
  });

  it("a viewer is blocked (needs edit access)", async () => {
    await loginAs(viewerId);
    await expect(suggestTaskPriority(taskId)).rejects.toThrow(PermissionError);
    expect(generateText).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- taskPriority.test.ts`
Expected: FAIL with "Cannot find module '@/app/actions/taskPriority'"

- [ ] **Step 3: Write the implementation**

`app/actions/taskPriority.ts`:

```ts
"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { resolveThreadRole, canManageTasks, PermissionError } from "@/lib/permissions";
import { getCalibrationThreadSummaries } from "@/lib/threadCalibration";
import { buildPriorityPrompt, parsePriorityResponse } from "@/lib/priorityPrompt";
import { generateText } from "@/lib/gemini";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new PermissionError("You must be logged in.");
  return session.user.id;
}

export async function suggestTaskPriority(taskId: string) {
  const userId = await requireUserId();

  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { primaryThread: { include: { shares: true } } },
  });

  const role = resolveThreadRole({
    ownerId: task.primaryThread.ownerId,
    shares: task.primaryThread.shares.map((s) => ({
      sharedWithUserId: s.sharedWithUserId,
      permission: s.permission,
    })),
    userId,
  });
  if (!canManageTasks(role)) throw new PermissionError();

  const calibrationThreads = await getCalibrationThreadSummaries(userId, task.primaryThreadId);
  const prompt = buildPriorityPrompt(
    { title: task.title, description: task.description, dueDate: task.dueDate },
    task.primaryThread.name,
    calibrationThreads
  );

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const responseText = await generateText(user.preferredAiModel, prompt);
  const priority = parsePriorityResponse(responseText);

  return db.task.update({
    where: { id: taskId },
    data: { priority, priorityIsAiSuggested: true },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- taskPriority.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add app/actions/taskPriority.ts tests/integration/taskPriority.test.ts
git commit -m "feat: add suggestTaskPriority server action"
```

---

### Task 5: `updateTask` clears the AI-suggested flag on manual edit

**Files:**
- Modify: `app/actions/tasks.ts`
- Test: `tests/integration/tasks-priority-flag.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `updateTask`'s existing signature is unchanged; its behavior gains the flag-clearing side effect described below.

- [ ] **Step 1: Read the current file**

Read `app/actions/tasks.ts` in full — find the existing `updateTask` function (it currently does `return db.task.update({ where: { id: taskId }, data: patch });` after the permission check). This task changes only that one line's worth of behavior.

- [ ] **Step 2: Write the failing test**

`tests/integration/tasks-priority-flag.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { createThread } from "@/app/actions/threads";
import { createTask, updateTask } from "@/app/actions/tasks";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("updateTask clears priorityIsAiSuggested", () => {
  let ownerId: string;
  let taskId: string;

  beforeEach(async () => {
    await resetDb();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    ownerId = owner.id;
    await loginAs(ownerId);
    const thread = await createThread({ name: "Thread", categoryColor: "#f2c14e" });
    const task = await createTask({ primaryThreadId: thread.id, title: "Task" });
    await db.task.update({ where: { id: task.id }, data: { priorityIsAiSuggested: true } });
    taskId = task.id;
  });
  afterAll(async () => db.$disconnect());

  it("clears the flag when priority is included in the patch, even to the same value", async () => {
    await loginAs(ownerId);
    const before = await db.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(before.priorityIsAiSuggested).toBe(true);

    const updated = await updateTask(taskId, { priority: before.priority });

    expect(updated.priorityIsAiSuggested).toBe(false);
  });

  it("leaves the flag untouched when priority is not part of the patch", async () => {
    await loginAs(ownerId);

    const updated = await updateTask(taskId, { title: "Renamed" });

    expect(updated.priorityIsAiSuggested).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tasks-priority-flag.test.ts`
Expected: FAIL on the first test ("clears the flag...") — `priorityIsAiSuggested` stays `true` since nothing clears it yet.

- [ ] **Step 4: Update `updateTask`**

In `app/actions/tasks.ts`, change `updateTask`'s body from a plain pass-through of `patch` to also clear the flag whenever `priority` is present in the patch:

```ts
export async function updateTask(
  taskId: string,
  patch: {
    title?: string;
    description?: string;
    workStatus?: "TODO" | "IN_PROGRESS" | "DONE";
    priority?: "LOW" | "MEDIUM" | "HIGH";
    dueDate?: Date | null;
  }
) {
  const userId = await requireUserId();
  await loadTaskWithThreadRole(taskId, userId);
  const data = "priority" in patch ? { ...patch, priorityIsAiSuggested: false } : patch;
  return db.task.update({ where: { id: taskId }, data });
}
```

(Leave every other part of the file — `createTask`, `moveTaskToThread`, `linkSecondaryThread`, `unlinkSecondaryThread`, `deleteTask`, the helper functions — exactly as they are.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tasks-priority-flag.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS (no regressions in `tests/integration/tasks.test.ts` or anything else that calls `updateTask`)

- [ ] **Step 7: Commit**

```bash
git add app/actions/tasks.ts tests/integration/tasks-priority-flag.test.ts
git commit -m "fix: clear priorityIsAiSuggested whenever priority is manually updated"
```

---

### Task 6: `NewTaskButton` gains description and due date fields

**Files:**
- Modify: `components/canvas/NewTaskButton.tsx`, `tests/component/NewTaskButton.test.tsx`

**Interfaces:**
- Produces: `NewTaskButton`'s `onCreate` callback signature becomes `(input: { title: string; description?: string; dueDate?: Date }) => void` (was `{ title: string }`).

- [ ] **Step 1: Read the current file**

Read `components/canvas/NewTaskButton.tsx` and `tests/component/NewTaskButton.test.tsx` in full — this component was built in an earlier sub-project and should still be close to its original title-only form, but confirm before editing.

- [ ] **Step 2: Write the failing tests (appended to the existing test file)**

Add these `it` blocks inside the existing `describe("NewTaskButton", ...)` (do not remove the existing test):

```tsx
  it("submits description and due date along with the title when provided", () => {
    const onCreate = vi.fn();
    render(<NewTaskButton threadId="th1" onCreate={onCreate} />);

    fireEvent.click(screen.getByRole("button", { name: "New task" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Draft summary" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Pull Q3 numbers" } });
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-04-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    expect(onCreate).toHaveBeenCalledWith({
      title: "Draft summary",
      description: "Pull Q3 numbers",
      dueDate: new Date("2026-04-01"),
    });
  });

  it("omits description and due date when left blank", () => {
    const onCreate = vi.fn();
    render(<NewTaskButton threadId="th1" onCreate={onCreate} />);

    fireEvent.click(screen.getByRole("button", { name: "New task" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Just a title" } });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    expect(onCreate).toHaveBeenCalledWith({
      title: "Just a title",
      description: undefined,
      dueDate: undefined,
    });
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- NewTaskButton.test.tsx`
Expected: FAIL — `getByLabelText("Description")`/`("Due date")` not found

- [ ] **Step 4: Update the implementation**

`components/canvas/NewTaskButton.tsx`:

```tsx
"use client";

import { useState } from "react";

export default function NewTaskButton({
  threadId,
  onCreate,
}: {
  threadId: string;
  onCreate: (input: { title: string; description?: string; dueDate?: Date }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");

  if (!open) {
    return <button onClick={() => setOpen(true)}>New task</button>;
  }

  return (
    <div role="dialog" aria-label={`New task in ${threadId}`}>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label>
        Due date
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </label>
      <button
        onClick={() => {
          onCreate({
            title,
            description: description || undefined,
            dueDate: dueDate ? new Date(dueDate) : undefined,
          });
          setOpen(false);
          setTitle("");
          setDescription("");
          setDueDate("");
        }}
      >
        Create task
      </button>
    </div>
  );
}
```

If the live file already differs from this (e.g. it has gained other props/behavior from a later fix), keep that intact and add only the description/due-date pieces shown here.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- NewTaskButton.test.tsx`
Expected: PASS (all existing tests plus the 2 new ones)

- [ ] **Step 6: Commit**

```bash
git add components/canvas/NewTaskButton.tsx tests/component/NewTaskButton.test.tsx
git commit -m "feat: add description and due date fields to task creation"
```

---

### Task 7: `TaskNode` shows an "AI suggested" badge

**Files:**
- Modify: `components/canvas/TaskNode.tsx`, `tests/component/TaskNode.test.tsx`

**Interfaces:**
- Produces: `TaskNode`'s `data` prop type gains `priorityIsAiSuggested: boolean`.

- [ ] **Step 1: Read the current files**

Read `components/canvas/TaskNode.tsx` and `tests/component/TaskNode.test.tsx` in full — this component has evolved since it was first built (permission-based gating, a `CardMenu`, etc. may have been added by later fixes). Identify exactly where the priority badge/span is currently rendered and what shape `data` currently has (copy the existing test's render call to see the current fixture fields) before making any change.

- [ ] **Step 2: Write the failing tests (appended to the existing test file)**

Add these `it` blocks inside the existing `describe("TaskNode", ...)`, reusing whatever base `data` fixture the existing tests already use (just add `priorityIsAiSuggested: true`/`false` to it — don't invent a new fixture shape):

```tsx
  it("shows an AI badge when the priority is AI-suggested", () => {
    render(
      <ReactFlowProvider>
        <TaskNode
          id="t1"
          data={{ title: "Draft exec summary", workStatus: "IN_PROGRESS", priority: "HIGH", updateCount: 3, priorityIsAiSuggested: true }}
        />
      </ReactFlowProvider>
    );
    expect(screen.getByLabelText("AI suggested")).toBeInTheDocument();
  });

  it("does not show an AI badge when the priority was manually set", () => {
    render(
      <ReactFlowProvider>
        <TaskNode
          id="t1"
          data={{ title: "Draft exec summary", workStatus: "IN_PROGRESS", priority: "HIGH", updateCount: 3, priorityIsAiSuggested: false }}
        />
      </ReactFlowProvider>
    );
    expect(screen.queryByLabelText("AI suggested")).not.toBeInTheDocument();
  });
```

If the live file's actual `data` fixture in its existing tests carries additional required fields (e.g. permission/handler props added by a later task), include those same fields in these two new test cases too — copy them from an existing passing test in the same file rather than guessing.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- TaskNode.test.tsx`
Expected: FAIL — `getByLabelText("AI suggested")` not found (and/or a TypeScript error if `priorityIsAiSuggested` isn't yet a recognized field, depending on how strictly the test file is type-checked at runtime)

- [ ] **Step 4: Update the implementation**

In `components/canvas/TaskNode.tsx`, add `priorityIsAiSuggested: boolean` to the `data` prop's type, and render a small badge next to the existing priority badge/span when it's `true`:

```tsx
{data.priorityIsAiSuggested && (
  <span aria-label="AI suggested" style={{ fontSize: 8, opacity: 0.7 }}>
    🤖 AI
  </span>
)}
```

Place this immediately after wherever the priority label is currently rendered, inside the same flex row if there is one — match the file's existing layout convention rather than introducing a new one. Do not change any existing gating/handler logic already in the file.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- TaskNode.test.tsx`
Expected: PASS (all existing tests plus the 2 new ones)

- [ ] **Step 6: Commit**

```bash
git add components/canvas/TaskNode.tsx tests/component/TaskNode.test.tsx
git commit -m "feat: show an AI-suggested badge on task cards"
```

---

### Task 8: `TaskDetailPanel` shows the same "AI suggested" badge

**Files:**
- Modify: `components/task-detail/TaskDetailPanel.tsx`, `tests/component/TaskDetailPanel.test.tsx`

**Interfaces:**
- Produces: `TaskDetailPanel`'s `task` prop type gains `priorityIsAiSuggested: boolean`.

- [ ] **Step 1: Read the current files**

Read `components/task-detail/TaskDetailPanel.tsx` and `tests/component/TaskDetailPanel.test.tsx` in full — identify the current `Task` type used by this component and where the priority `<select>` is rendered, and what shape the existing tests' `task` fixture has.

- [ ] **Step 2: Write the failing tests (appended to the existing test file)**

Add these `it` blocks, extending the existing `task` fixture object with `priorityIsAiSuggested` (copy the existing fixture's other fields rather than redefining them):

```tsx
  it("shows an AI badge next to priority when priorityIsAiSuggested is true", () => {
    render(
      <TaskDetailPanel
        task={{ ...task, priorityIsAiSuggested: true }}
        updates={updates}
        onUpdateTask={vi.fn()}
        onAddComment={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByLabelText("AI suggested")).toBeInTheDocument();
  });

  it("does not show an AI badge when priorityIsAiSuggested is false", () => {
    render(
      <TaskDetailPanel
        task={{ ...task, priorityIsAiSuggested: false }}
        updates={updates}
        onUpdateTask={vi.fn()}
        onAddComment={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByLabelText("AI suggested")).not.toBeInTheDocument();
  });
```

(`task` and `updates` here refer to whatever the existing test file's shared fixtures are already named — reuse them exactly as the file's existing tests do.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- TaskDetailPanel.test.tsx`
Expected: FAIL — badge not found

- [ ] **Step 4: Update the implementation**

Add `priorityIsAiSuggested: boolean` to the component's `Task` type, and render the same badge markup used in `TaskNode` (Task 7) immediately next to the priority `<select>`:

```tsx
{task.priorityIsAiSuggested && (
  <span aria-label="AI suggested" style={{ fontSize: 8, opacity: 0.7 }}>
    🤖 AI
  </span>
)}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- TaskDetailPanel.test.tsx`
Expected: PASS (all existing tests plus the 2 new ones)

- [ ] **Step 6: Commit**

```bash
git add components/task-detail/TaskDetailPanel.tsx tests/component/TaskDetailPanel.test.tsx
git commit -m "feat: show the AI-suggested badge in the task detail panel too"
```

---

### Task 9: Wire the fire-and-forget suggestion into the canvas

**Files:**
- Modify: `components/canvas/Canvas.tsx`, `app/canvas/page.tsx`, `tests/component/Canvas.test.tsx`

**Interfaces:**
- Consumes: `suggestTaskPriority` (Task 4); `NewTaskButton`'s new `onCreate` shape (Task 6); `priorityIsAiSuggested` on `TaskNode`/`TaskDetailPanel` (Tasks 7-8).
- Produces: task creation in the UI immediately calls `createTask` (unchanged, fast), then fires `suggestTaskPriority` without awaiting it before returning control to the user, applying its result to the existing per-task override state once it resolves.

- [ ] **Step 1: Read the current files**

Read `components/canvas/Canvas.tsx` and `app/canvas/page.tsx` in full. Find: (a) the existing task-creation handler that currently calls `createTask({ primaryThreadId, title })` and is passed to `NewTaskButton`'s `onCreate`; (b) the existing `taskEditOverrides` (or equivalently-named) per-task-id override state and its `withOverride`-style merge helper, already used for other task fields; (c) where `app/canvas/page.tsx` maps raw `Task` rows into the `tasks` prop passed to `<Canvas>`.

- [ ] **Step 2: Add `priorityIsAiSuggested` to the data pipeline**

In `app/canvas/page.tsx`, add `priorityIsAiSuggested: t.priorityIsAiSuggested` to the object literal already mapping each task's fields (alongside `title`, `workStatus`, `priority`, etc.) for the `tasks` prop passed to `<Canvas>`. In `Canvas.tsx`, add `priorityIsAiSuggested: boolean` to whatever `TaskSummary`-style type already describes a task there.

- [ ] **Step 3: Update the task-creation handler**

Extend the existing creation handler to accept the new fields and to fire the suggestion request afterward without awaiting it:

```ts
const handleCreateTask = useCallback(
  async (threadId: string, input: { title: string; description?: string; dueDate?: Date }) => {
    const created = await createTask({ primaryThreadId: threadId, ...input });
    router.refresh();

    void suggestTaskPriority(created.id)
      .then((updated) => {
        setTaskEditOverrides((prev) => ({
          ...prev,
          [created.id]: {
            ...prev[created.id],
            priority: updated.priority,
            priorityIsAiSuggested: updated.priorityIsAiSuggested,
          },
        }));
      })
      .catch(() => {
        // Priority suggestion is a background enhancement — failures are
        // silent by design, the task keeps its default MEDIUM priority.
      });
  },
  [router]
);
```

Adapt the exact names (`handleCreateTask`, `taskEditOverrides`/`setTaskEditOverrides`, `router`) to whatever the live file actually calls them, and import `suggestTaskPriority` from `@/app/actions/taskPriority`. If the existing handler's signature or the override-merge mechanism differs from what's shown here, integrate into the real shape rather than replacing it wholesale — this task adds one new fire-and-forget call plus threading two new fields through, it does not restructure the existing creation/override flow.

- [ ] **Step 4: Write a component test proving the wiring**

Add to `tests/component/Canvas.test.tsx` (mocking `@/app/actions/taskPriority` alongside whatever other action modules the file already mocks):

```tsx
vi.mock("@/app/actions/taskPriority", () => ({ suggestTaskPriority: vi.fn() }));
import { suggestTaskPriority } from "@/app/actions/taskPriority";

// ...inside the existing describe block:

it("fires suggestTaskPriority after creating a task and applies the result once it resolves", async () => {
  vi.mocked(suggestTaskPriority).mockResolvedValue({
    id: "new-task-id",
    priority: "HIGH",
    priorityIsAiSuggested: true,
  } as never);

  render(<Canvas threads={testThreads} tasks={testTasks} positions={{}} preferredAiModel="gemini-2.5-pro" />);

  fireEvent.click(screen.getByRole("button", { name: "New task" }));
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New task" } });
  fireEvent.click(screen.getByRole("button", { name: "Create task" }));

  await waitFor(() => {
    expect(suggestTaskPriority).toHaveBeenCalled();
  });
});
```

Adapt `testThreads`/`testTasks` and the exact `createTask` mock's resolved shape (it needs to resolve with an `id` for `suggestTaskPriority` to be called with) to whatever fixtures the file already uses.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS (every prior test plus this task's additions)

- [ ] **Step 6: Commit**

```bash
git add components/canvas/Canvas.tsx app/canvas/page.tsx tests/component/Canvas.test.tsx
git commit -m "feat: wire fire-and-forget AI priority suggestion into task creation"
```

---

### Task 10: End-to-end test

**Files:**
- Create: `tests/e2e/ai-prioritization-flow.spec.ts`

**Interfaces:**
- Consumes: the running app and every piece built in Tasks 1-9.

This test exercises the real Gemini API (there is no way to test the actual AI-suggestion content without it, and mocking the SDK inside a real browser/server process isn't practical) — it must only assert observable, model-independent behavior: that a badge appears, and that manually changing priority makes it disappear. It must NOT assert which specific priority the AI chose, since that's non-deterministic.

- [ ] **Step 1: Read the current UI**

Read `components/canvas/NewTaskButton.tsx`, `components/canvas/TaskNode.tsx`, and `components/task-detail/TaskDetailPanel.tsx` as they exist after Tasks 6-8 to confirm exact labels/aria-labels.

- [ ] **Step 2: Write the end-to-end test**

`tests/e2e/ai-prioritization-flow.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("AI priority suggestion appears after task creation and disappears on manual override", async ({ page }) => {
  const email = `aipriority-${Date.now()}@example.com`;

  await page.goto("/signup");
  await page.getByPlaceholder("Name").fill("Priority Tester");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill("correcthorse123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/canvas/);

  await page.getByRole("button", { name: "New thread" }).click();
  await page.getByLabel("Thread name").fill("Q3 Report");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Q3 Report")).toBeVisible();

  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Title").fill("Fix a critical login bug affecting all mobile users");
  await page.getByLabel("Description").fill("Users cannot sign in on iOS or Android as of this morning.");
  await page.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByText("Fix a critical login bug affecting all mobile users")).toBeVisible();

  // Wait for the fire-and-forget suggestion to land (real Gemini call).
  await expect(page.getByLabel("AI suggested")).toBeVisible({ timeout: 20000 });

  await page.getByText("Fix a critical login bug affecting all mobile users").click();
  await expect(page.getByLabel("AI suggested")).toBeVisible();

  await page.getByLabel("Priority").selectOption("LOW");
  await expect(page.getByLabel("AI suggested")).toHaveCount(0);
});
```

- [ ] **Step 3: Run the end-to-end test**

Run: `npm run test:e2e`
Expected: PASS. If a selector doesn't match the real current UI, fix the test to match reality rather than the app — the same principle prior sub-projects' final e2e tasks followed. If the AI badge never appears within the timeout, verify manually first whether `GEMINI_API_KEY` is valid and `suggestTaskPriority` is actually being invoked (check server logs) before concluding the test itself is wrong.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/ai-prioritization-flow.spec.ts
git commit -m "test: add end-to-end coverage for AI-assisted prioritization"
```

---

## Verification (manual, after all tasks land)

- `npm test` and `npm run test:e2e` both pass in full.
- Create a task with an urgent-sounding title/description and a near due date; confirm it appears instantly at MEDIUM, then updates to a real AI-chosen priority with the AI badge within a few seconds, with no visible error even if you watch closely.
- Create a couple of threads, let sub-project 2's catch-up feature generate real summaries for them (or manually trigger via "View catch-up"), then create a new task in a different thread and confirm (via temporary logging, if needed) that the calibration context in the prompt actually includes those other threads' summaries.
- Manually change a task's priority after the AI has suggested one; confirm the AI badge disappears immediately and stays gone after a reload.
- Confirm a Viewer (shared, not owner/editor) cannot trigger `suggestTaskPriority` directly (this is defense-in-depth — the current UI never exposes it to a Viewer since Viewers can't create tasks in the first place).
