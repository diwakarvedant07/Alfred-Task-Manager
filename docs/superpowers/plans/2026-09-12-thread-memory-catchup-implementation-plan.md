# Thread Memory & AI Catch-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build sub-project 2 of Arc — when a user reopens a thread they personally haven't viewed in 24+ hours, show them an AI-generated (Google Gemini) catch-up summarizing what happened while they were away, built by extending a single rolling per-thread summary rather than resummarizing from scratch each time.

**Architecture:** New Prisma models (`ThreadView` for per-user last-viewed tracking, `ThreadSummary` for the shared rolling summary) plus a `User.preferredAiModel` field. A thin `lib/gemini.ts` wrapper around the `@google/genai` SDK. Pure/testable modules for the staleness check and prompt construction, separated from the DB-querying activity lookup and the orchestrating Server Action — following the same `lib/` (pure) vs `app/actions/` (auth + permission + DB) split the Foundation codebase already uses.

**Tech Stack:** Everything already in the Foundation codebase (Next.js App Router, Prisma/Postgres, Vitest/Testing Library) plus `@google/genai` (Google's Gemini SDK) as the one new dependency.

## Global Constraints

- Staleness threshold is exactly 24 hours, personalized per `(threadId, userId)` — never global to the thread.
- `ThreadSummary` is one row per thread, shared by every collaborator, updated by *extending* the previous `summaryText` with new activity — never regenerated from scratch when a previous summary exists.
- Provider is Google Gemini via `@google/genai`'s `GoogleGenAI` client and `ai.models.generateContent({ model, contents })`, reading the key from `GEMINI_API_KEY`. Not Claude/Anthropic.
- Model used for a given call is the triggering user's own `User.preferredAiModel` (default `"gemini-2.5-pro"`), not a fixed app-wide model.
- On a stale reopen the catch-up modal always appears, but a Gemini call only happens when there is genuinely new activity since `ThreadSummary.lastIncludedAt` — reuse the stored text otherwise.
- Both the trigger action and the read-only "view stored summary" action require `canViewThread` (Viewer or above) via `lib/permissions.ts` — no new permission tier.
- Every task ends with a passing test run and a commit before moving to the next task. No test may call the real Gemini API — mock `@/lib/gemini` (or `@google/genai` directly, per task) in every test that would otherwise trigger a network call.

---

## File Structure

```
prisma/
  schema.prisma                          # + ThreadView, ThreadSummary, User.preferredAiModel
lib/
  gemini.ts                              # generateText(model, prompt) wrapper over @google/genai
  threadStaleness.ts                     # isThreadStale(lastViewedAt, now)
  threadActivity.ts                      # hasNewThreadActivity, getNewThreadActivity (DB queries)
  catchUpPrompt.ts                       # buildCatchUpPrompt(...) — pure prompt construction
app/actions/
  threadCatchUp.ts                       # openThreadAndMaybeGetCatchUp, getStoredThreadSummary
  aiModel.ts                             # updatePreferredAiModel
  ...                                    # (page.tsx passes preferredAiModel through, no new action file)
components/
  settings/ModelPicker.tsx               # preset dropdown + custom model ID input
  canvas/CatchUpModal.tsx                # full-screen catch-up display
  canvas/CardMenu.tsx                    # modified: thread variant gains onViewCatchUp
  canvas/Canvas.tsx                      # modified: thread-bubble click wiring, ModelPicker render
app/canvas/page.tsx                      # modified: fetch + pass user.preferredAiModel
.env.example                             # + GEMINI_API_KEY
tests/
  unit/threadStaleness.test.ts
  unit/catchUpPrompt.test.ts
  unit/gemini.test.ts
  integration/threadActivity.test.ts
  integration/threadCatchUp.test.ts
  integration/aiModel.test.ts
  component/ModelPicker.test.tsx
  component/CatchUpModal.test.tsx
  component/CardMenu.test.tsx            # extended, not replaced
  e2e/catchup-flow.spec.ts
```

---

### Task 1: Prisma schema additions

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `tests/integration/schema-catchup.test.ts`

**Interfaces:**
- Consumes: the existing `Thread`, `User` models (Task 2 of the Foundation plan).
- Produces: `ThreadView` model (composite PK `[threadId, userId]`, fields `lastViewedAt: DateTime`); `ThreadSummary` model (PK `threadId`, fields `summaryText: String`, `lastIncludedAt: DateTime`, `updatedAt: DateTime`); `User.preferredAiModel: String` (default `"gemini-2.5-pro"`).

- [ ] **Step 1: Read the current schema and apply the additions**

Read `prisma/schema.prisma` first — it should currently contain the `User` and `Thread` models exactly as built by the Foundation plan. Apply these three changes:

In `model User { ... }`, add the `preferredAiModel` field and the `threadViews` back-relation:

```prisma
model User {
  id               String    @id @default(cuid())
  email            String    @unique
  passwordHash     String
  name             String
  themeMode        ThemeMode @default(DARK)
  accentColor      String    @default("#38e0ff")
  preferredAiModel String    @default("gemini-2.5-pro")
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  ownedThreads   Thread[]       @relation("ThreadOwner")
  taskUpdates    TaskUpdate[]
  taskPositions  TaskPosition[]
  sharesReceived ThreadShare[]  @relation("ShareRecipient")
  threadViews    ThreadView[]
}
```

In `model Thread { ... }`, add the `views` and `summary` back-relations:

```prisma
model Thread {
  id            String       @id @default(cuid())
  ownerId       String
  owner         User         @relation("ThreadOwner", fields: [ownerId], references: [id])
  name          String
  categoryColor String
  status        ThreadStatus @default(ACTIVE)
  deletedAt     DateTime?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  primaryTasks   Task[]           @relation("PrimaryThread")
  secondaryLinks TaskThreadLink[]
  shares         ThreadShare[]
  views          ThreadView[]
  summary        ThreadSummary?
}
```

Append two new models at the end of the file (after the existing `ThreadShare` model):

```prisma
model ThreadView {
  threadId     String
  userId       String
  thread       Thread   @relation(fields: [threadId], references: [id])
  user         User     @relation(fields: [userId], references: [id])
  lastViewedAt DateTime

  @@id([threadId, userId])
}

model ThreadSummary {
  threadId       String   @id
  thread         Thread   @relation(fields: [threadId], references: [id])
  summaryText    String
  lastIncludedAt DateTime
  updatedAt      DateTime @updatedAt
}
```

- [ ] **Step 2: Run the migration**

```bash
npx prisma migrate dev --name add_thread_view_and_summary
```

Expected: migration applies cleanly, `@prisma/client` regenerates with no type errors.

- [ ] **Step 3: Write the failing integration test**

`tests/integration/schema-catchup.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";

describe("ThreadView and ThreadSummary schema", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  it("creates a ThreadView keyed by (threadId, userId) and a User with the default preferredAiModel", async () => {
    const user = await db.user.create({
      data: { email: "a@example.com", passwordHash: "x", name: "Ada" },
    });
    const thread = await db.thread.create({
      data: { ownerId: user.id, name: "Q3 Report", categoryColor: "#f2c14e" },
    });

    expect(user.preferredAiModel).toBe("gemini-2.5-pro");

    const view = await db.threadView.create({
      data: { threadId: thread.id, userId: user.id, lastViewedAt: new Date("2026-01-01") },
    });
    expect(view.threadId).toBe(thread.id);
    expect(view.userId).toBe(user.id);

    const fetched = await db.threadView.findUnique({
      where: { threadId_userId: { threadId: thread.id, userId: user.id } },
    });
    expect(fetched).not.toBeNull();
  });

  it("creates a ThreadSummary with a unique threadId", async () => {
    const user = await db.user.create({
      data: { email: "b@example.com", passwordHash: "x", name: "Bo" },
    });
    const thread = await db.thread.create({
      data: { ownerId: user.id, name: "Primary", categoryColor: "#38e0ff" },
    });

    const summary = await db.threadSummary.create({
      data: { threadId: thread.id, summaryText: "Initial summary.", lastIncludedAt: new Date() },
    });
    expect(summary.threadId).toBe(thread.id);

    await expect(
      db.threadSummary.create({
        data: { threadId: thread.id, summaryText: "Duplicate.", lastIncludedAt: new Date() },
      })
    ).rejects.toThrow();
  });
});
```

Run: `npm test -- schema-catchup.test.ts`
Expected: PASS immediately (this test verifies the schema/migration from Steps 1-2, not a red/green feature cycle — if it fails, the schema has a bug to fix before continuing).

- [ ] **Step 4: Commit**

```bash
git add prisma tests/integration/schema-catchup.test.ts
git commit -m "feat: add ThreadView, ThreadSummary, and User.preferredAiModel"
```

---

### Task 2: Gemini client wrapper

**Files:**
- Create: `lib/gemini.ts`, `tests/unit/gemini.test.ts`
- Modify: `.env.example`, `package.json` (add `@google/genai`)

**Interfaces:**
- Consumes: `process.env.GEMINI_API_KEY`.
- Produces: `generateText(model: string, prompt: string): Promise<string>`.

- [ ] **Step 1: Install the SDK**

```bash
npm install @google/genai
```

- [ ] **Step 2: Add the env var**

Add to `.env.example`:

```bash
GEMINI_API_KEY="dev-only-change-me"
```

Copy the new line into your local `.env` too, with a real key for manual testing later (tests in this plan mock the SDK and never call the real API).

- [ ] **Step 3: Write the failing test**

`tests/unit/gemini.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateContent = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

import { generateText } from "@/lib/gemini";

describe("generateText", () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
    process.env.GEMINI_API_KEY = "test-key";
  });

  it("calls generateContent with the given model and prompt, and returns the response text", async () => {
    mockGenerateContent.mockResolvedValue({ text: "Hello from Gemini" });

    const result = await generateText("gemini-2.5-flash", "Say hi");

    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: "gemini-2.5-flash",
      contents: "Say hi",
    });
    expect(result).toBe("Hello from Gemini");
  });

  it("returns an empty string if the response has no text", async () => {
    mockGenerateContent.mockResolvedValue({ text: undefined });

    const result = await generateText("gemini-2.5-flash", "Say hi");

    expect(result).toBe("");
  });

  it("throws a clear error when GEMINI_API_KEY is not set", async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(generateText("gemini-2.5-flash", "Say hi")).rejects.toThrow(
      "GEMINI_API_KEY is not set."
    );
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- gemini.test.ts`
Expected: FAIL with "Cannot find module '@/lib/gemini'"

- [ ] **Step 5: Write the implementation**

`lib/gemini.ts`:

```ts
import { GoogleGenAI } from "@google/genai";

export async function generateText(model: string, prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({ model, contents: prompt });
  return response.text ?? "";
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- gemini.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add lib/gemini.ts tests/unit/gemini.test.ts .env.example package.json package-lock.json
git commit -m "feat: add Gemini client wrapper"
```

---

### Task 3: Thread staleness check

**Files:**
- Create: `lib/threadStaleness.ts`, `tests/unit/threadStaleness.test.ts`

**Interfaces:**
- Consumes: nothing (pure function).
- Produces: `STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000`; `isThreadStale(lastViewedAt: Date | null, now: Date): boolean`.

- [ ] **Step 1: Write the failing test**

`tests/unit/threadStaleness.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isThreadStale, STALE_THRESHOLD_MS } from "@/lib/threadStaleness";

describe("isThreadStale", () => {
  const now = new Date("2026-03-01T00:00:00Z");

  it("is false when never viewed before", () => {
    expect(isThreadStale(null, now)).toBe(false);
  });

  it("is false at exactly the 24-hour threshold", () => {
    const lastViewedAt = new Date(now.getTime() - STALE_THRESHOLD_MS);
    expect(isThreadStale(lastViewedAt, now)).toBe(false);
  });

  it("is true just past the 24-hour threshold", () => {
    const lastViewedAt = new Date(now.getTime() - STALE_THRESHOLD_MS - 1);
    expect(isThreadStale(lastViewedAt, now)).toBe(true);
  });

  it("is false for a view an hour ago", () => {
    const lastViewedAt = new Date(now.getTime() - 60 * 60 * 1000);
    expect(isThreadStale(lastViewedAt, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- threadStaleness.test.ts`
Expected: FAIL with "Cannot find module '@/lib/threadStaleness'"

- [ ] **Step 3: Write the implementation**

`lib/threadStaleness.ts`:

```ts
export const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export function isThreadStale(lastViewedAt: Date | null, now: Date): boolean {
  if (lastViewedAt === null) return false;
  return now.getTime() - lastViewedAt.getTime() > STALE_THRESHOLD_MS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- threadStaleness.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/threadStaleness.ts tests/unit/threadStaleness.test.ts
git commit -m "feat: add thread staleness check"
```

---

### Task 4: Thread activity queries

**Files:**
- Create: `lib/threadActivity.ts`, `tests/integration/threadActivity.test.ts`

**Interfaces:**
- Consumes: `db` from `lib/db.ts`.
- Produces: `type ThreadActivityTask = { id: string; title: string; workStatus: string; priority: string; dueDate: Date | null; isNew: boolean }`; `type ThreadActivityUpdate = { taskTitle: string; authorName: string; body: string; createdAt: Date }`; `type ThreadActivity = { tasks: ThreadActivityTask[]; updates: ThreadActivityUpdate[] }`; `hasNewThreadActivity(threadId: string, since: Date | null): Promise<boolean>`; `getNewThreadActivity(threadId: string, since: Date | null): Promise<ThreadActivity>`.

`since: null` means "no prior summary cursor exists" — in that case "new activity" means "any activity at all" (a task or a comment exists), and every returned task is `isNew: true`.

- [ ] **Step 1: Write the failing test**

`tests/integration/threadActivity.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { hasNewThreadActivity, getNewThreadActivity } from "@/lib/threadActivity";

describe("thread activity queries", () => {
  let threadId: string;
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "Ada" } });
    const thread = await db.thread.create({
      data: { ownerId: user.id, name: "Q3 Report", categoryColor: "#f2c14e" },
    });
    userId = user.id;
    threadId = thread.id;
  });
  afterAll(async () => db.$disconnect());

  it("with since=null: reports activity exists when any task exists, and marks it as new", async () => {
    const task = await db.task.create({
      data: { primaryThreadId: threadId, title: "Draft summary" },
    });

    expect(await hasNewThreadActivity(threadId, null)).toBe(true);

    const activity = await getNewThreadActivity(threadId, null);
    expect(activity.tasks).toHaveLength(1);
    expect(activity.tasks[0]).toMatchObject({ id: task.id, title: "Draft summary", isNew: true });
  });

  it("with since=null: reports no activity for a thread with zero tasks and zero comments", async () => {
    expect(await hasNewThreadActivity(threadId, null)).toBe(false);
    const activity = await getNewThreadActivity(threadId, null);
    expect(activity.tasks).toHaveLength(0);
    expect(activity.updates).toHaveLength(0);
  });

  it("with a cursor: only counts tasks/comments newer than the cursor", async () => {
    const oldTask = await db.task.create({
      data: { primaryThreadId: threadId, title: "Old task" },
    });
    await new Promise((r) => setTimeout(r, 20));
    const cursor = new Date();
    await new Promise((r) => setTimeout(r, 20));
    const newTask = await db.task.create({
      data: { primaryThreadId: threadId, title: "New task" },
    });

    expect(await hasNewThreadActivity(threadId, cursor)).toBe(true);

    const activity = await getNewThreadActivity(threadId, cursor);
    expect(activity.tasks.map((t) => t.id)).toEqual([newTask.id]);
    expect(activity.tasks[0].isNew).toBe(true);
    void oldTask;
  });

  it("with a cursor: an updated (not newly created) task is included and marked not new", async () => {
    const task = await db.task.create({
      data: { primaryThreadId: threadId, title: "Task" },
    });
    await new Promise((r) => setTimeout(r, 20));
    const cursor = new Date();
    await new Promise((r) => setTimeout(r, 20));
    await db.task.update({ where: { id: task.id }, data: { workStatus: "DONE" } });

    const activity = await getNewThreadActivity(threadId, cursor);
    expect(activity.tasks).toHaveLength(1);
    expect(activity.tasks[0]).toMatchObject({ id: task.id, workStatus: "DONE", isNew: false });
  });

  it("with a cursor: includes new comments with author name and task title", async () => {
    const task = await db.task.create({
      data: { primaryThreadId: threadId, title: "Draft summary" },
    });
    await new Promise((r) => setTimeout(r, 20));
    const cursor = new Date();
    await new Promise((r) => setTimeout(r, 20));
    await db.taskUpdate.create({
      data: { taskId: task.id, authorId: userId, body: "Pulled the numbers." },
    });

    expect(await hasNewThreadActivity(threadId, cursor)).toBe(true);

    const activity = await getNewThreadActivity(threadId, cursor);
    expect(activity.updates).toHaveLength(1);
    expect(activity.updates[0]).toMatchObject({
      taskTitle: "Draft summary",
      authorName: "Ada",
      body: "Pulled the numbers.",
    });
  });

  it("with a cursor and no new activity, reports false and empty arrays", async () => {
    await db.task.create({ data: { primaryThreadId: threadId, title: "Old task" } });
    const cursor = new Date(Date.now() + 60_000);

    expect(await hasNewThreadActivity(threadId, cursor)).toBe(false);
    const activity = await getNewThreadActivity(threadId, cursor);
    expect(activity.tasks).toHaveLength(0);
    expect(activity.updates).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- threadActivity.test.ts`
Expected: FAIL with "Cannot find module '@/lib/threadActivity'"

- [ ] **Step 3: Write the implementation**

`lib/threadActivity.ts`:

```ts
import { db } from "@/lib/db";

export type ThreadActivityTask = {
  id: string;
  title: string;
  workStatus: string;
  priority: string;
  dueDate: Date | null;
  isNew: boolean;
};

export type ThreadActivityUpdate = {
  taskTitle: string;
  authorName: string;
  body: string;
  createdAt: Date;
};

export type ThreadActivity = {
  tasks: ThreadActivityTask[];
  updates: ThreadActivityUpdate[];
};

function taskWhere(threadId: string, since: Date | null) {
  if (since === null) {
    return { primaryThreadId: threadId };
  }
  return {
    primaryThreadId: threadId,
    OR: [{ createdAt: { gt: since } }, { updatedAt: { gt: since } }],
  };
}

function updateWhere(threadId: string, since: Date | null) {
  if (since === null) {
    return { task: { primaryThreadId: threadId } };
  }
  return { task: { primaryThreadId: threadId }, createdAt: { gt: since } };
}

export async function hasNewThreadActivity(threadId: string, since: Date | null): Promise<boolean> {
  const taskCount = await db.task.count({ where: taskWhere(threadId, since) });
  if (taskCount > 0) return true;
  const updateCount = await db.taskUpdate.count({ where: updateWhere(threadId, since) });
  return updateCount > 0;
}

export async function getNewThreadActivity(threadId: string, since: Date | null): Promise<ThreadActivity> {
  const tasks = await db.task.findMany({ where: taskWhere(threadId, since) });
  const activityTasks: ThreadActivityTask[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    workStatus: t.workStatus,
    priority: t.priority,
    dueDate: t.dueDate,
    isNew: since === null || t.createdAt > since,
  }));

  const updates = await db.taskUpdate.findMany({
    where: updateWhere(threadId, since),
    include: { author: true, task: true },
    orderBy: { createdAt: "asc" },
  });
  const activityUpdates: ThreadActivityUpdate[] = updates.map((u) => ({
    taskTitle: u.task.title,
    authorName: u.author.name,
    body: u.body,
    createdAt: u.createdAt,
  }));

  return { tasks: activityTasks, updates: activityUpdates };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- threadActivity.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/threadActivity.ts tests/integration/threadActivity.test.ts
git commit -m "feat: add thread activity-since-cursor queries"
```

---

### Task 5: Catch-up prompt builder

**Files:**
- Create: `lib/catchUpPrompt.ts`, `tests/unit/catchUpPrompt.test.ts`

**Interfaces:**
- Consumes: `ThreadActivity` type (Task 4).
- Produces: `buildCatchUpPrompt(threadName: string, previousSummary: string | null, activity: ThreadActivity): string`.

- [ ] **Step 1: Write the failing test**

`tests/unit/catchUpPrompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildCatchUpPrompt } from "@/lib/catchUpPrompt";
import type { ThreadActivity } from "@/lib/threadActivity";

describe("buildCatchUpPrompt", () => {
  it("says there is no previous summary yet, when previousSummary is null", () => {
    const activity: ThreadActivity = { tasks: [], updates: [] };
    const prompt = buildCatchUpPrompt("Q3 Report", null, activity);
    expect(prompt).toContain("no previous summary yet");
    expect(prompt).not.toContain("Previous summary:");
  });

  it("includes the previous summary text when one exists", () => {
    const activity: ThreadActivity = { tasks: [], updates: [] };
    const prompt = buildCatchUpPrompt("Q3 Report", "Ada finished the intro.", activity);
    expect(prompt).toContain("Previous summary:");
    expect(prompt).toContain("Ada finished the intro.");
  });

  it("lists tasks with a NEW/UPDATED marker, status, priority, and due date", () => {
    const activity: ThreadActivity = {
      tasks: [
        {
          id: "t1",
          title: "Draft summary",
          workStatus: "IN_PROGRESS",
          priority: "HIGH",
          dueDate: new Date("2026-04-01"),
          isNew: true,
        },
        {
          id: "t2",
          title: "Pull metrics",
          workStatus: "DONE",
          priority: "MEDIUM",
          dueDate: null,
          isNew: false,
        },
      ],
      updates: [],
    };
    const prompt = buildCatchUpPrompt("Q3 Report", null, activity);
    expect(prompt).toContain('[NEW] "Draft summary" — IN_PROGRESS, HIGH priority, due 2026-04-01');
    expect(prompt).toContain('[UPDATED] "Pull metrics" — DONE, MEDIUM priority');
  });

  it("lists new comments with author and task title", () => {
    const activity: ThreadActivity = {
      tasks: [],
      updates: [
        { taskTitle: "Draft summary", authorName: "Ada", body: "Started the intro.", createdAt: new Date() },
      ],
    };
    const prompt = buildCatchUpPrompt("Q3 Report", null, activity);
    expect(prompt).toContain('Ada on "Draft summary": Started the intro.');
  });

  it("includes the thread name and an instruction to output only the summary", () => {
    const activity: ThreadActivity = { tasks: [], updates: [] };
    const prompt = buildCatchUpPrompt("Q3 Report", null, activity);
    expect(prompt).toContain("Q3 Report");
    expect(prompt).toContain("Write only the updated summary text");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- catchUpPrompt.test.ts`
Expected: FAIL with "Cannot find module '@/lib/catchUpPrompt'"

- [ ] **Step 3: Write the implementation**

`lib/catchUpPrompt.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- catchUpPrompt.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/catchUpPrompt.ts tests/unit/catchUpPrompt.test.ts
git commit -m "feat: add rolling catch-up prompt builder"
```

---

### Task 6: Thread catch-up Server Actions

**Files:**
- Create: `app/actions/threadCatchUp.ts`, `tests/integration/threadCatchUp.test.ts`

**Interfaces:**
- Consumes: `db`, `auth()`, `resolveThreadRole`, `canViewThread`, `PermissionError` (Foundation); `isThreadStale` (Task 3); `hasNewThreadActivity`, `getNewThreadActivity` (Task 4); `buildCatchUpPrompt` (Task 5); `generateText` (Task 2).
- Produces: `openThreadAndMaybeGetCatchUp(threadId: string, now?: Date): Promise<{ showCatchUp: boolean; summary: string | null }>`; `getStoredThreadSummary(threadId: string): Promise<string | null>`.

`now` defaults to `new Date()` but is overridable so tests can simulate the passage of time without real waiting — the same pattern `lib/purge.ts`'s `purgeExpiredItems(now: Date)` already uses in this codebase.

- [ ] **Step 1: Write the failing test**

`tests/integration/threadCatchUp.test.ts`:

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

import { openThreadAndMaybeGetCatchUp, getStoredThreadSummary } from "@/app/actions/threadCatchUp";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("thread catch-up actions", () => {
  let ownerId: string;
  let strangerId: string;
  let threadId: string;

  beforeEach(async () => {
    await resetDb();
    vi.mocked(generateText).mockReset();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const stranger = await db.user.create({ data: { email: "stranger@x.com", passwordHash: "x", name: "Stranger" } });
    ownerId = owner.id;
    strangerId = stranger.id;

    await loginAs(ownerId);
    const thread = await createThread({ name: "Q3 Report", categoryColor: "#f2c14e" });
    threadId = thread.id;
  });
  afterAll(async () => db.$disconnect());

  it("never viewed before: records the view, does not show a catch-up, does not call Gemini", async () => {
    await loginAs(ownerId);
    const now = new Date("2026-03-01T00:00:00Z");
    const result = await openThreadAndMaybeGetCatchUp(threadId, now);

    expect(result).toEqual({ showCatchUp: false, summary: null });
    expect(generateText).not.toHaveBeenCalled();

    const view = await db.threadView.findUnique({ where: { threadId_userId: { threadId, userId: ownerId } } });
    expect(view?.lastViewedAt).toEqual(now);
  });

  it("viewed again within 24h: not stale, no catch-up", async () => {
    await loginAs(ownerId);
    const firstView = new Date("2026-03-01T00:00:00Z");
    await openThreadAndMaybeGetCatchUp(threadId, firstView);

    const secondView = new Date(firstView.getTime() + 60 * 60 * 1000);
    const result = await openThreadAndMaybeGetCatchUp(threadId, secondView);

    expect(result.showCatchUp).toBe(false);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("stale with no activity and no prior summary: shows a fixed message, no Gemini call", async () => {
    await loginAs(ownerId);
    const firstView = new Date("2026-03-01T00:00:00Z");
    await openThreadAndMaybeGetCatchUp(threadId, firstView);

    const staleView = new Date(firstView.getTime() + 25 * 60 * 60 * 1000);
    const result = await openThreadAndMaybeGetCatchUp(threadId, staleView);

    expect(result.showCatchUp).toBe(true);
    expect(result.summary).toBe("Nothing to catch up on yet.");
    expect(generateText).not.toHaveBeenCalled();
  });

  it("stale with new activity and no prior summary: calls Gemini and persists the summary", async () => {
    await loginAs(ownerId);
    const firstView = new Date("2026-03-01T00:00:00Z");
    await openThreadAndMaybeGetCatchUp(threadId, firstView);
    await createTask({ primaryThreadId: threadId, title: "Draft summary" });

    vi.mocked(generateText).mockResolvedValue("Ada started drafting the summary.");

    const staleView = new Date(firstView.getTime() + 25 * 60 * 60 * 1000);
    const result = await openThreadAndMaybeGetCatchUp(threadId, staleView);

    expect(result.showCatchUp).toBe(true);
    expect(result.summary).toBe("Ada started drafting the summary.");
    expect(generateText).toHaveBeenCalledTimes(1);

    const stored = await db.threadSummary.findUnique({ where: { threadId } });
    expect(stored?.summaryText).toBe("Ada started drafting the summary.");
    expect(stored?.lastIncludedAt).toEqual(staleView);
  });

  it("stale with an existing summary and no new activity since it: reuses the stored text, no Gemini call", async () => {
    await loginAs(ownerId);
    // Anchor on real "now" rather than a fixed past literal: the task's
    // createdAt is set by the real clock (createTask doesn't accept an
    // override), so lastIncludedAt must be computed relative to that same
    // real clock or the "no new activity since the cursor" comparison
    // below is meaningless.
    const firstView = new Date();
    await openThreadAndMaybeGetCatchUp(threadId, firstView);
    await createTask({ primaryThreadId: threadId, title: "Draft summary" });
    vi.mocked(generateText).mockResolvedValue("First summary.");
    const staleView1 = new Date(firstView.getTime() + 25 * 60 * 60 * 1000);
    await openThreadAndMaybeGetCatchUp(threadId, staleView1);

    vi.mocked(generateText).mockReset();
    const staleView2 = new Date(staleView1.getTime() + 25 * 60 * 60 * 1000);
    const result = await openThreadAndMaybeGetCatchUp(threadId, staleView2);

    expect(result.showCatchUp).toBe(true);
    expect(result.summary).toBe("First summary.");
    expect(generateText).not.toHaveBeenCalled();
  });

  it("uses the calling user's preferredAiModel", async () => {
    await loginAs(ownerId);
    await db.user.update({ where: { id: ownerId }, data: { preferredAiModel: "gemini-2.5-flash" } });
    // A first view must happen before a stale one is possible — a thread
    // with no ThreadView row yet is never "stale" (see isThreadStale).
    const firstView = new Date();
    await openThreadAndMaybeGetCatchUp(threadId, firstView);
    await createTask({ primaryThreadId: threadId, title: "Task" });
    vi.mocked(generateText).mockResolvedValue("Summary.");

    const staleView = new Date(firstView.getTime() + 25 * 60 * 60 * 1000);
    await openThreadAndMaybeGetCatchUp(threadId, staleView);

    expect(generateText).toHaveBeenCalledWith("gemini-2.5-flash", expect.any(String));
  });

  it("blocks a stranger with no access", async () => {
    await loginAs(strangerId);
    await expect(openThreadAndMaybeGetCatchUp(threadId)).rejects.toThrow(PermissionError);
  });

  it("getStoredThreadSummary returns null when none exists, the text when it does, and never touches ThreadView", async () => {
    await loginAs(ownerId);
    expect(await getStoredThreadSummary(threadId)).toBeNull();

    const firstView = new Date();
    await openThreadAndMaybeGetCatchUp(threadId, firstView);
    await createTask({ primaryThreadId: threadId, title: "Task" });
    vi.mocked(generateText).mockResolvedValue("Stored summary.");
    const staleView = new Date(firstView.getTime() + 25 * 60 * 60 * 1000);
    await openThreadAndMaybeGetCatchUp(threadId, staleView);

    const before = await db.threadView.findUnique({ where: { threadId_userId: { threadId, userId: ownerId } } });
    const text = await getStoredThreadSummary(threadId);
    const after = await db.threadView.findUnique({ where: { threadId_userId: { threadId, userId: ownerId } } });

    expect(text).toBe("Stored summary.");
    expect(after?.lastViewedAt).toEqual(before?.lastViewedAt);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- threadCatchUp.test.ts`
Expected: FAIL with "Cannot find module '@/app/actions/threadCatchUp'"

- [ ] **Step 3: Write the implementation**

`app/actions/threadCatchUp.ts`:

```ts
"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { resolveThreadRole, canViewThread, PermissionError } from "@/lib/permissions";
import { isThreadStale } from "@/lib/threadStaleness";
import { hasNewThreadActivity, getNewThreadActivity } from "@/lib/threadActivity";
import { buildCatchUpPrompt } from "@/lib/catchUpPrompt";
import { generateText } from "@/lib/gemini";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new PermissionError("You must be logged in.");
  return session.user.id;
}

async function requireViewRole(threadId: string, userId: string) {
  const thread = await db.thread.findUniqueOrThrow({
    where: { id: threadId },
    include: { shares: true },
  });
  const role = resolveThreadRole({
    ownerId: thread.ownerId,
    shares: thread.shares.map((s) => ({ sharedWithUserId: s.sharedWithUserId, permission: s.permission })),
    userId,
  });
  if (!canViewThread(role)) throw new PermissionError();
  return thread;
}

export async function openThreadAndMaybeGetCatchUp(
  threadId: string,
  now: Date = new Date()
): Promise<{ showCatchUp: boolean; summary: string | null }> {
  const userId = await requireUserId();
  const thread = await requireViewRole(threadId, userId);

  const view = await db.threadView.findUnique({
    where: { threadId_userId: { threadId, userId } },
  });
  const stale = isThreadStale(view?.lastViewedAt ?? null, now);

  await db.threadView.upsert({
    where: { threadId_userId: { threadId, userId } },
    create: { threadId, userId, lastViewedAt: now },
    update: { lastViewedAt: now },
  });

  if (!stale) {
    return { showCatchUp: false, summary: null };
  }

  const existingSummary = await db.threadSummary.findUnique({ where: { threadId } });
  const cursor = existingSummary?.lastIncludedAt ?? null;
  const hasActivity = await hasNewThreadActivity(threadId, cursor);

  if (!hasActivity) {
    return {
      showCatchUp: true,
      summary: existingSummary?.summaryText ?? "Nothing to catch up on yet.",
    };
  }

  const activity = await getNewThreadActivity(threadId, cursor);
  const prompt = buildCatchUpPrompt(thread.name, existingSummary?.summaryText ?? null, activity);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const summaryText = await generateText(user.preferredAiModel, prompt);

  await db.threadSummary.upsert({
    where: { threadId },
    create: { threadId, summaryText, lastIncludedAt: now },
    update: { summaryText, lastIncludedAt: now },
  });

  return { showCatchUp: true, summary: summaryText };
}

export async function getStoredThreadSummary(threadId: string): Promise<string | null> {
  const userId = await requireUserId();
  await requireViewRole(threadId, userId);
  const summary = await db.threadSummary.findUnique({ where: { threadId } });
  return summary?.summaryText ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- threadCatchUp.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add app/actions/threadCatchUp.ts tests/integration/threadCatchUp.test.ts
git commit -m "feat: add thread catch-up trigger and read-only summary actions"
```

---

### Task 7: Preferred AI model Server Action

**Files:**
- Create: `app/actions/aiModel.ts`, `tests/integration/aiModel.test.ts`

**Interfaces:**
- Consumes: `db`, `auth()`, `PermissionError`.
- Produces: `updatePreferredAiModel(model: string): Promise<User>`.

- [ ] **Step 1: Write the failing test**

`tests/integration/aiModel.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { PermissionError } from "@/lib/permissions";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

import { updatePreferredAiModel } from "@/app/actions/aiModel";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("updatePreferredAiModel", () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "Ada" } });
    userId = user.id;
  });
  afterAll(async () => db.$disconnect());

  it("updates the user's preferredAiModel", async () => {
    await loginAs(userId);
    const updated = await updatePreferredAiModel("gemini-2.5-flash");
    expect(updated.preferredAiModel).toBe("gemini-2.5-flash");

    const fetched = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(fetched.preferredAiModel).toBe("gemini-2.5-flash");
  });

  it("accepts an arbitrary custom model id, trimmed", async () => {
    await loginAs(userId);
    const updated = await updatePreferredAiModel("  gemini-3.0-experimental  ");
    expect(updated.preferredAiModel).toBe("gemini-3.0-experimental");
  });

  it("rejects an empty model id", async () => {
    await loginAs(userId);
    await expect(updatePreferredAiModel("   ")).rejects.toThrow();
  });

  it("requires being logged in", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(updatePreferredAiModel("gemini-2.5-pro")).rejects.toThrow(PermissionError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- aiModel.test.ts`
Expected: FAIL with "Cannot find module '@/app/actions/aiModel'"

- [ ] **Step 3: Write the implementation**

`app/actions/aiModel.ts`:

```ts
"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";

export async function updatePreferredAiModel(model: string) {
  const session = await auth();
  if (!session?.user?.id) throw new PermissionError("You must be logged in.");

  const trimmed = model.trim();
  if (!trimmed) {
    throw new Error("Model id must not be empty.");
  }

  return db.user.update({
    where: { id: session.user.id },
    data: { preferredAiModel: trimmed },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- aiModel.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/actions/aiModel.ts tests/integration/aiModel.test.ts
git commit -m "feat: add preferred AI model server action"
```

---

### Task 8: ModelPicker component

**Files:**
- Create: `components/settings/ModelPicker.tsx`, `tests/component/ModelPicker.test.tsx`

**Interfaces:**
- Consumes: nothing beyond React (controlled — the page wires `onChange` to `updatePreferredAiModel`, Task 7).
- Produces: `ModelPicker({ value, onChange }: { value: string; onChange: (model: string) => void })`.

- [ ] **Step 1: Write the failing test**

`tests/component/ModelPicker.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ModelPicker from "@/components/settings/ModelPicker";

describe("ModelPicker", () => {
  it("calls onChange with the new value when a preset is selected", () => {
    const onChange = vi.fn();
    render(<ModelPicker value="gemini-2.5-pro" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("AI model"), { target: { value: "gemini-2.5-flash" } });
    expect(onChange).toHaveBeenCalledWith("gemini-2.5-flash");
  });

  it("shows a pre-filled custom text input when value is not one of the presets", () => {
    const onChange = vi.fn();
    render(<ModelPicker value="gemini-3.0-experimental" onChange={onChange} />);

    const select = screen.getByLabelText("AI model") as HTMLSelectElement;
    expect(select.value).toBe("custom");
    const input = screen.getByLabelText("Custom model ID") as HTMLInputElement;
    expect(input.value).toBe("gemini-3.0-experimental");

    fireEvent.change(input, { target: { value: "gemini-3.1-experimental" } });
    expect(onChange).toHaveBeenCalledWith("gemini-3.1-experimental");
  });

  it("switching the select to Custom shows an empty input and reports an empty value", () => {
    const onChange = vi.fn();
    render(<ModelPicker value="gemini-2.5-pro" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("AI model"), { target: { value: "custom" } });
    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.getByLabelText("Custom model ID")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ModelPicker.test.tsx`
Expected: FAIL with "Cannot find module '@/components/settings/ModelPicker'"

- [ ] **Step 3: Write the implementation**

`components/settings/ModelPicker.tsx`:

```tsx
"use client";

import { useState } from "react";

const PRESET_MODELS = ["gemini-2.5-pro", "gemini-2.5-flash"] as const;
const CUSTOM_OPTION = "custom";

function isPresetModel(value: string): boolean {
  return (PRESET_MODELS as readonly string[]).includes(value);
}

export default function ModelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (model: string) => void;
}) {
  const preset = isPresetModel(value);
  const [customText, setCustomText] = useState(preset ? "" : value);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <label>
        AI model
        <select
          aria-label="AI model"
          value={preset ? value : CUSTOM_OPTION}
          onChange={(e) => {
            if (e.target.value === CUSTOM_OPTION) {
              onChange(customText);
            } else {
              onChange(e.target.value);
            }
          }}
        >
          {PRESET_MODELS.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
          <option value={CUSTOM_OPTION}>Custom…</option>
        </select>
      </label>
      {!preset && (
        <input
          aria-label="Custom model ID"
          value={customText}
          onChange={(e) => {
            setCustomText(e.target.value);
            onChange(e.target.value);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ModelPicker.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add components/settings/ModelPicker.tsx tests/component/ModelPicker.test.tsx
git commit -m "feat: add AI model picker control"
```

---

### Task 9: CatchUpModal component

**Files:**
- Create: `components/canvas/CatchUpModal.tsx`, `tests/component/CatchUpModal.test.tsx`

**Interfaces:**
- Consumes: nothing beyond React (the parent, Task 11, wires `summary`/`loading` state and `onClose`).
- Produces: `CatchUpModal({ summary, loading, onClose }: { summary: string | null; loading: boolean; onClose: () => void })`.

- [ ] **Step 1: Write the failing test**

`tests/component/CatchUpModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CatchUpModal from "@/components/canvas/CatchUpModal";

describe("CatchUpModal", () => {
  it("shows a loading message while loading, not the summary", () => {
    render(<CatchUpModal summary={null} loading={true} onClose={vi.fn()} />);
    expect(screen.getByText("Catching you up…")).toBeInTheDocument();
  });

  it("shows the summary text once loaded", () => {
    render(<CatchUpModal summary="You made great progress." loading={false} onClose={vi.fn()} />);
    expect(screen.getByText("You made great progress.")).toBeInTheDocument();
    expect(screen.queryByText("Catching you up…")).not.toBeInTheDocument();
  });

  it("calls onClose from both the close button and the Got it button", () => {
    const onClose = vi.fn();
    render(<CatchUpModal summary="Summary" loading={false} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Got it"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- CatchUpModal.test.tsx`
Expected: FAIL with "Cannot find module '@/components/canvas/CatchUpModal'"

- [ ] **Step 3: Write the implementation**

`components/canvas/CatchUpModal.tsx`:

```tsx
"use client";

export default function CatchUpModal({
  summary,
  loading,
  onClose,
}: {
  summary: string | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Catch-up"
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg)",
        color: "var(--text)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        zIndex: 100,
      }}
    >
      <button aria-label="Close" onClick={onClose} style={{ position: "absolute", top: 16, right: 16 }}>
        ×
      </button>
      {loading ? <p>Catching you up…</p> : <p style={{ maxWidth: 480, textAlign: "center" }}>{summary}</p>}
      {!loading && <button onClick={onClose}>Got it</button>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- CatchUpModal.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add components/canvas/CatchUpModal.tsx tests/component/CatchUpModal.test.tsx
git commit -m "feat: add catch-up modal"
```

---

### Task 10: Extend CardMenu with "View catch-up"

**Files:**
- Modify: `components/canvas/CardMenu.tsx`, `tests/component/CardMenu.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CardMenu`'s thread variant (`variant: "thread"`) gains a required `onViewCatchUp: () => void` prop, rendered as a menu item available to every role (unlike Close/Delete, which stay gated by the caller — the caller decides whether to even render this variant's Close/Delete-relevant handlers based on role, same as today; `onViewCatchUp` is always shown).

- [ ] **Step 1: Read the current file**

Read `components/canvas/CardMenu.tsx` in full before editing — it was built in the Foundation plan and has since had `e.stopPropagation()` added to its wrapper by a later fix. Confirm its current `ThreadMenuProps` type and the JSX block that renders the four thread-variant menu items (`Rename thread`, `Change category color`, `Close thread`, `Delete thread`) before making the change below, and adapt the exact old/new text if the live file differs from what's shown here.

- [ ] **Step 2: Write the failing test (appended to the existing file)**

Add this `it` block inside the existing `describe("CardMenu", ...)` in `tests/component/CardMenu.test.tsx` (do not remove any existing tests):

```tsx
  it("thread variant renders a 'View catch-up' item that calls onViewCatchUp", () => {
    const onViewCatchUp = vi.fn();
    render(
      <CardMenu
        variant="thread"
        onRename={vi.fn()}
        onChangeColor={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onViewCatchUp={onViewCatchUp}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByText("View catch-up"));
    expect(onViewCatchUp).toHaveBeenCalled();
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- CardMenu.test.tsx`
Expected: FAIL — `onViewCatchUp` is not a recognized prop / "View catch-up" text not found

- [ ] **Step 4: Update the `ThreadMenuProps` type**

In `components/canvas/CardMenu.tsx`, add `onViewCatchUp` to the thread variant's props type:

```tsx
type ThreadMenuProps = {
  variant: "thread";
  onRename: () => void;
  onChangeColor: () => void;
  onClose: () => void;
  onDelete: () => void;
  onViewCatchUp: () => void;
};
```

- [ ] **Step 5: Render the new menu item**

In the thread-variant branch of the menu's JSX (the block rendering `Rename thread` / `Change category color` / `Close thread` / `Delete thread`), add a new item — place it first, above the other four, since it's available to every role while the others may be conditionally rendered/gated by the caller:

```tsx
<button role="menuitem" onClick={() => runAndClose(props.onViewCatchUp)}>View catch-up</button>
```

(Use whatever the existing items' exact button/`runAndClose` pattern is in the live file — this new item follows the identical shape.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- CardMenu.test.tsx`
Expected: PASS (all existing CardMenu tests plus the new one)

- [ ] **Step 7: Commit**

```bash
git add components/canvas/CardMenu.tsx tests/component/CardMenu.test.tsx
git commit -m "feat: add View catch-up item to the thread card menu"
```

---

### Task 11: Wire catch-up and model picker into the canvas

**Files:**
- Modify: `components/canvas/Canvas.tsx`, `app/canvas/page.tsx`, `tests/component/Canvas.test.tsx`

**Interfaces:**
- Consumes: `openThreadAndMaybeGetCatchUp`, `getStoredThreadSummary` (Task 6); `updatePreferredAiModel` (Task 7); `ModelPicker` (Task 8); `CatchUpModal` (Task 9); `CardMenu`'s new `onViewCatchUp` (Task 10).
- Produces: `Canvas` gains a `preferredAiModel: string` prop; clicking a thread bubble opens the catch-up flow; the thread's "⋮" menu's new item opens the same modal read-only.

- [ ] **Step 1: Read the current files**

Read `components/canvas/Canvas.tsx` and `app/canvas/page.tsx` in full before editing. `Canvas.tsx` has evolved through several fix rounds since it was first built (per-task-id edit overrides, `canEdit`/`canManageTasks`-derived gating passed down from `page.tsx`, existing `NewThreadButton`/`NewTaskButton`/`ShareThreadDialog`/`AccentColorPicker`/`ThemeToggle` rendering in a settings strip, and a `handleNodeClick` that currently only acts on `node.type === "task"`). Integrate the pieces below into that existing structure rather than restructuring it — this task adds new state and a new branch in the existing click handler, it does not rewrite the file.

- [ ] **Step 2: Add `preferredAiModel` to the canvas page**

In `app/canvas/page.tsx`, the query for the current user already selects the full `User` row (for `themeMode`/`accentColor`). Pass the additional field through to `<Canvas>`:

```tsx
<Canvas
  // ...existing props unchanged...
  preferredAiModel={user.preferredAiModel}
/>
```

- [ ] **Step 3: Extend `Canvas`'s props type and add catch-up/model state**

In `components/canvas/Canvas.tsx`, add `preferredAiModel: string` to the top-level `Canvas` component's props type and thread it down into `CanvasInner` alongside the other props it already forwards. Inside `CanvasInner`, alongside the existing state declarations, add:

```tsx
import CatchUpModal from "./CatchUpModal";
import ModelPicker from "@/components/settings/ModelPicker";
import { openThreadAndMaybeGetCatchUp, getStoredThreadSummary } from "@/app/actions/threadCatchUp";
import { updatePreferredAiModel } from "@/app/actions/aiModel";

// alongside existing useState declarations:
const [catchUp, setCatchUp] = useState<{ summary: string | null; loading: boolean } | null>(null);
const [aiModel, setAiModel] = useState(preferredAiModel);
```

- [ ] **Step 4: Add the thread-bubble click handler**

Add a new handler and extend the existing node-click logic to call it for thread nodes:

```tsx
const handleThreadBubbleClick = useCallback(async (threadId: string) => {
  setCatchUp({ summary: null, loading: true });
  const result = await openThreadAndMaybeGetCatchUp(threadId);
  if (result.showCatchUp) {
    setCatchUp({ summary: result.summary, loading: false });
  } else {
    setCatchUp(null);
  }
}, []);

const handleViewStoredCatchUp = useCallback(async (threadId: string) => {
  setCatchUp({ summary: null, loading: true });
  const summary = await getStoredThreadSummary(threadId);
  setCatchUp({ summary: summary ?? "Nothing to catch up on yet.", loading: false });
}, []);
```

In the existing `handleNodeClick` (or wherever the current `if (node.type !== "task") return;` early-return lives), add a branch for thread nodes instead of returning immediately:

```tsx
if (node.type === "threadBubble") {
  void handleThreadBubbleClick(node.id);
  return;
}
```

Wire `onViewCatchUp={() => handleViewStoredCatchUp(thread.id)}` into wherever `ThreadBubbleNode`'s `CardMenu` props are currently assembled (alongside the existing `onRename`/`onChangeColor`/`onClose`/`onDelete` handlers from the earlier thread-management wiring).

- [ ] **Step 5: Render the modal and the model picker**

Render the modal as a sibling of the existing `<ReactFlow>` element (same pattern as the existing `TaskDetailPanel` rendering):

```tsx
{catchUp && (
  <CatchUpModal
    summary={catchUp.summary}
    loading={catchUp.loading}
    onClose={() => setCatchUp(null)}
  />
)}
```

Add `ModelPicker` next to the existing `AccentColorPicker`/`ThemeToggle` controls in the settings strip:

```tsx
<ModelPicker
  value={aiModel}
  onChange={async (model) => {
    setAiModel(model);
    await updatePreferredAiModel(model);
  }}
/>
```

- [ ] **Step 6: Write a component test proving the wiring**

Add to `tests/component/Canvas.test.tsx` (following its existing mocking pattern for `@/app/actions/*`):

```tsx
vi.mock("@/app/actions/threadCatchUp", () => ({
  openThreadAndMaybeGetCatchUp: vi.fn(),
  getStoredThreadSummary: vi.fn(),
}));
vi.mock("@/app/actions/aiModel", () => ({ updatePreferredAiModel: vi.fn() }));

import { openThreadAndMaybeGetCatchUp } from "@/app/actions/threadCatchUp";
import { updatePreferredAiModel } from "@/app/actions/aiModel";

// ...inside the existing describe block:

it("clicking a thread bubble opens the catch-up modal when the server says to show one", async () => {
  vi.mocked(openThreadAndMaybeGetCatchUp).mockResolvedValue({
    showCatchUp: true,
    summary: "Welcome back.",
  });

  render(<Canvas threads={testThreads} tasks={testTasks} positions={{}} preferredAiModel="gemini-2.5-pro" />);

  fireEvent.click(screen.getByText(testThreads[0].name));

  expect(await screen.findByText("Welcome back.")).toBeInTheDocument();
});

it("changing the model picker calls updatePreferredAiModel", async () => {
  render(<Canvas threads={testThreads} tasks={testTasks} positions={{}} preferredAiModel="gemini-2.5-pro" />);

  fireEvent.change(screen.getByLabelText("AI model"), { target: { value: "gemini-2.5-flash" } });

  await waitFor(() => {
    expect(updatePreferredAiModel).toHaveBeenCalledWith("gemini-2.5-flash");
  });
});
```

Adapt `testThreads`/`testTasks` to whatever fixture shape the existing `Canvas.test.tsx` already uses (it already renders `Canvas` with sample threads/tasks for its other tests) rather than inventing a new shape.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS (every prior test plus this task's additions)

- [ ] **Step 8: Commit**

```bash
git add components/canvas/Canvas.tsx app/canvas/page.tsx tests/component/Canvas.test.tsx
git commit -m "feat: wire thread catch-up and AI model picker into the canvas"
```

---

### Task 12: End-to-end test

**Files:**
- Create: `tests/e2e/catchup-flow.spec.ts`

**Interfaces:**
- Consumes: the running app and every piece built in Tasks 1–11.

Real time cannot be fast-forwarded in a browser test, so this test covers the parts of the flow that don't depend on the 24-hour wait (the manual "View catch-up" path, and confirming a normal reopen within the window does NOT show a modal) — the staleness math itself is already covered by Task 6's integration tests using an injected `now`.

- [ ] **Step 1: Read the current UI**

Read `components/canvas/Canvas.tsx` and `components/canvas/ThreadBubbleNode.tsx` as they exist after Task 11 to confirm the exact clickable text/labels for a thread bubble and its "⋮" menu, the same way Task 20 of the Foundation plan required reading the live UI before writing its selectors.

- [ ] **Step 2: Write the end-to-end test**

`tests/e2e/catchup-flow.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("thread catch-up: no modal on first-ever view, manual View catch-up works, AI model preference persists", async ({ page }) => {
  const email = `catchup-${Date.now()}@example.com`;

  await page.goto("/signup");
  await page.getByPlaceholder("Name").fill("Catchup Tester");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill("correcthorse123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/canvas/);

  await page.getByRole("button", { name: "New thread" }).click();
  await page.getByLabel("Thread name").fill("Q3 Report");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Q3 Report")).toBeVisible();

  // First-ever view of a brand new thread: no catch-up modal.
  await page.getByText("Q3 Report").click();
  await expect(page.getByRole("dialog", { name: "Catch-up" })).toHaveCount(0);

  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Title").fill("Draft exec summary");
  await page.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByText("Draft exec summary")).toBeVisible();

  // Manual "View catch-up" from the thread menu shows the stored (or placeholder) summary.
  await page.getByRole("button", { name: "More actions" }).first().click();
  await page.getByText("View catch-up").click();
  await expect(page.getByRole("dialog", { name: "Catch-up" })).toBeVisible();
  await expect(page.getByText("Nothing to catch up on yet.")).toBeVisible();
  await page.getByText("Got it").click();
  await expect(page.getByRole("dialog", { name: "Catch-up" })).toHaveCount(0);

  // Change the AI model preference and confirm it persists across a reload.
  await page.getByLabel("AI model").selectOption("gemini-2.5-flash");
  await page.reload();
  await expect(page.getByLabel("AI model")).toHaveValue("gemini-2.5-flash");
});
```

- [ ] **Step 3: Run the end-to-end test**

Run: `npm run test:e2e`
Expected: PASS. If a selector doesn't match (e.g. the thread menu trigger's accessible name, or the exact wording of the empty-summary placeholder), fix the test to match the real UI built in Tasks 9–11 rather than changing the app to match a guess — the test should encode the actual flow, the same principle Task 20 of the Foundation plan followed.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/catchup-flow.spec.ts
git commit -m "test: add end-to-end coverage for the thread catch-up flow"
```

---

## Verification (manual, after all tasks land)

- `npm test` and `npm run test:e2e` both pass in full.
- With a real `GEMINI_API_KEY` in `.env`: create a thread with a couple of tasks and comments, then directly edit the `ThreadView.lastViewedAt` row in the database to more than 24 hours ago (or wait), reopen the thread, and confirm a real Gemini-generated catch-up appears — then add another comment, reopen again, and confirm the summary genuinely extends the previous one rather than repeating it from scratch.
- Confirm two different logged-in accounts sharing a thread each get their own independent stale/not-stale state, but see the same summary text once caught up.
- Change the AI model via the picker (including typing a custom model ID), trigger a regeneration, and confirm the request actually used that model (check server logs or temporarily log the model argument).
- Confirm "View catch-up" never changes `ThreadView.lastViewedAt` (inspect the DB row before and after clicking it).
