# Jarvis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent chat panel ("Jarvis") where a user hands Claude^H^H^HGemini free-form text and it decides — via Gemini's native function-calling — whether to create a task in an existing thread, create a new thread, log a comment on an existing task, or change a task's status/priority, executing that action immediately through the app's existing (already permission-gated) Server Actions.

**Architecture:** One Gemini call per chat message, injected with a bounded list of the user's own+shared ACTIVE threads (id/name/summary) as system context. Gemini is given one on-demand read tool (`findTasks`) and four write tools, each a thin wrapper around an existing Server Action (`createTask`, `createThread`, `addTaskUpdate`, `updateTask`), so permission enforcement is inherited rather than reimplemented. A bounded loop (max 4 rounds) lets Gemini call `findTasks` to resolve a task by name, then call a write tool with the resolved id, before producing a final natural-language reply. Every user message and assistant reply is persisted to a new `JarvisMessage` table; only the most recent ~20 messages are sent back to Gemini as conversation history per turn.

**Tech Stack:** Same as the rest of Arc — Next.js Server Actions, Prisma 7 + `@prisma/adapter-pg` against the live Supabase Postgres DB, `@google/genai` v2.22.0 (already installed), Vitest + Testing Library + Playwright.

## Global Constraints

- Gemini model calls use the calling user's own `User.preferredAiModel` (same as sub-projects 2 and 3) — never a hardcoded model id.
- Every Jarvis write tool must be a thin wrapper around an *existing* Server Action (`createTask`, `createThread`, `addTaskUpdate`, `updateTask` from `app/actions/tasks.ts`, `app/actions/threads.ts`, `app/actions/taskUpdates.ts`) — never reimplement permission logic. A `PermissionError` thrown by the wrapped action must be caught per-tool-call and turned into a failed tool result (`{ error: { message } }` fed back to Gemini) plus a chip entry — it must never propagate out of `sendJarvisMessage` and crash the whole turn.
- `sendJarvisMessage` is called **awaited** from the client (not fire-and-forget) — the user is directly waiting on a reply. A failure in the Gemini call itself (not a per-tool failure — the whole round-trip failing, e.g. network/rate-limit) must still result in `sendJarvisMessage` returning normally, having persisted a visible error-flavored assistant `JarvisMessage` ("Something went wrong — try again"), never throwing to the caller.
- The tool-calling loop is capped at **4 rounds** (a "round" = one Gemini call + executing any function calls it returned). If the model still hasn't produced a stop-reason of plain text after 4 rounds, stop and return a fallback reply summarizing that some actions were taken (from the accumulated chip log) without waiting for a 5th round — this bounds worst-case latency/cost per message.
- Only the four **write** tool calls produce a chip entry in the persisted `toolCalls` log (and are rendered as confirmation chips in the UI); `findTasks` (the read tool) never produces a chip — it's an internal lookup, not a user-facing action.
- Only the most recent **20** `JarvisMessage` rows for the user are included as conversation history in the Gemini request per turn (oldest-first). The full log still renders in the UI.
- `JarvisPanel` is a client component; its own component tests must mock `@/app/actions/jarvis` — never let a component test hit the real Gemini API or a live DB.
- Integration tests for `sendJarvisMessage` mock `@/lib/gemini`'s `generateWithTools` (never `@google/genai` directly, following the precedent in `tests/integration/taskPriority.test.ts`) so they exercise real DB writes through the real wrapped actions, with only the model call itself faked.
- Test commands: `npm test` (Vitest, all of `tests/unit`, `tests/component`, `tests/integration`) and `npx playwright test` (e2e, port 3089, already configured in `playwright.config.ts`). Run the full `npm test` suite after every task — it must stay green (currently 174/174) before moving to the next task.

---

### Task 1: Verify `@google/genai`'s tool-calling API shape against the live SDK

This is a research/verification task, not a code task — it exists because the design spec explicitly flagged tool-calling as an unexercised surface of a library whose model-ID assumptions already went stale once this week (see `.superpowers/sdd/progress.md`'s dead-preset-model notes from the prior sub-project). Do this BEFORE writing any code in Task 2, so Task 2's code is based on confirmed fact, not assumption.

**Files:**
- None created or modified. This task only produces a short confirmation note appended to `.superpowers/sdd/progress.md` (create the file if it doesn't exist, following the format used in the prior sub-project's ledger — one paragraph, no code).

- [ ] **Step 1: Confirm the type shapes by reading the installed SDK's own type declarations**

Read (do not skim) these exact sections of `node_modules/@google/genai/dist/genai.d.ts` in the project root and confirm each of the following six facts still holds in the installed version (`^2.22.0`, check the exact installed version via `node_modules/@google/genai/package.json`'s `"version"` field and note it):

1. `export declare interface FunctionDeclaration` has `name?: string`, `description?: string`, `parametersJsonSchema?: unknown` (a plain-JSON-Schema alternative to the more verbose `parameters?: Schema` field — confirm `parametersJsonSchema` exists; it is what Task 3 will use).
2. `export declare interface Tool` has `functionDeclarations?: FunctionDeclaration[]`.
3. `export declare interface GenerateContentConfig` has both `systemInstruction?: ContentUnion` and `tools?: Tool[]`.
4. `export declare class GenerateContentResponse` exposes a `get functionCalls(): FunctionCall[] | undefined` getter, and `candidates?: Candidate[]` where `Candidate.content?: Content`.
5. `export declare interface FunctionCall` has `name?: string`, `args?: Record<string, unknown>`.
6. `export declare class FunctionResponse` has `name?: string`, `response?: Record<string, unknown>` (convention: `{ output: ... }` on success, `{ error: ... }` on failure), and `export declare interface Part` has both `functionCall?: FunctionCall` and `functionResponse?: FunctionResponse` fields, and `export declare interface Content` has `role?: string` documented as "Must be either 'user' or 'model'".

Run this to confirm the version and re-grep the six facts above yourself rather than trusting this document's line numbers (they will drift if the package is ever updated):

```bash
cat node_modules/@google/genai/package.json | grep '"version"'
grep -n "parametersJsonSchema" node_modules/@google/genai/dist/genai.d.ts
grep -n "functionDeclarations?: FunctionDeclaration" node_modules/@google/genai/dist/genai.d.ts
grep -n "^export declare interface GenerateContentConfig" -A 20 node_modules/@google/genai/dist/genai.d.ts | grep -E "systemInstruction|tools\?:"
grep -n "get functionCalls" node_modules/@google/genai/dist/genai.d.ts
grep -n "^export declare interface FunctionCall {" -A 6 node_modules/@google/genai/dist/genai.d.ts
grep -n "^export declare class FunctionResponse {" -A 12 node_modules/@google/genai/dist/genai.d.ts
```

- [ ] **Step 2: If any fact does NOT hold** (the SDK has changed shape since this plan was written), STOP and report back — do not proceed to Task 2 with guessed alternatives. Task 2's exact code depends on all six facts holding.

- [ ] **Step 3: Record the confirmation**

If all six facts hold, append this note to `.superpowers/sdd/progress.md` (create the file with a one-line header if it doesn't already exist in this fresh worktree):

```
Task 1: complete. Verified @google/genai vX.Y.Z (from node_modules/@google/genai/package.json)
still exposes: FunctionDeclaration.parametersJsonSchema, Tool.functionDeclarations,
GenerateContentConfig.{systemInstruction,tools}, GenerateContentResponse.functionCalls getter +
candidates[0].content, FunctionCall.{name,args}, FunctionResponse.{name,response}, and
Part.{functionCall,functionResponse}. Proceeding with Task 2 as planned.
```

(replace vX.Y.Z with the actual installed version)

No test run needed for this task (no code changed). Commit the progress-ledger note:

```bash
git add .superpowers/sdd/progress.md
git commit -m "docs: confirm @google/genai tool-calling API shape before implementation"
```

(Note: `.superpowers/` is gitignored per the existing `.gitignore` from prior sub-projects — if `git add` reports it's ignored, that's expected and correct; skip the commit for this file and just leave the note on disk. Only commit if `git add` actually stages it.)

---

### Task 2: `generateWithTools` in `lib/gemini.ts`

**Files:**
- Modify: `lib/gemini.ts`
- Test: `tests/unit/gemini.test.ts`

**Interfaces:**
- Consumes: nothing new (extends the existing `lib/gemini.ts`, which already exports `generateText(model: string, prompt: string): Promise<string>` — do not remove or change that function, sub-projects 2 and 3 depend on it).
- Produces: `generateWithTools(model: string, contents: Content[], config: { systemInstruction?: string; tools?: FunctionDeclaration[] }): Promise<{ text: string; functionCalls: FunctionCall[]; modelContent: Content }>` — Task 7 (`app/actions/jarvis.ts`) is the only consumer.

- [ ] **Step 1: Write the failing tests**

Modify `tests/unit/gemini.test.ts` (the file already mocks `@google/genai` at the top with `mockGenerateContent` — reuse that same mock; do not duplicate the `vi.mock` call). First, change the existing top-of-file import line from `import { generateText } from "@/lib/gemini";` to also bring in the new function:

```ts
import { generateText, generateWithTools } from "@/lib/gemini";
```

Then add a new `describe` block below the existing `generateText` one (do not add a second `import` statement anywhere else in the file — only the top import line above needs changing):

```ts
describe("generateWithTools", () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
    process.env.GEMINI_API_KEY = "test-key";
  });

  it("passes contents, systemInstruction, and tools through to generateContent", async () => {
    mockGenerateContent.mockResolvedValue({
      text: "Hi there",
      functionCalls: undefined,
      candidates: [{ content: { role: "model", parts: [{ text: "Hi there" }] } }],
    });

    const tools = [{ name: "doThing", description: "Does a thing", parametersJsonSchema: { type: "object", properties: {} } }];
    const contents = [{ role: "user" as const, parts: [{ text: "hello" }] }];

    await generateWithTools("gemini-3.8-flash", contents, { systemInstruction: "Be helpful.", tools });

    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: "gemini-3.8-flash",
      contents,
      config: {
        systemInstruction: "Be helpful.",
        tools: [{ functionDeclarations: tools }],
      },
    });
  });

  it("returns text, functionCalls, and modelContent from the response", async () => {
    const modelContent = {
      role: "model",
      parts: [{ functionCall: { name: "createTaskInThread", args: { threadId: "t1", title: "Do X" } } }],
    };
    mockGenerateContent.mockResolvedValue({
      text: undefined,
      functionCalls: [{ name: "createTaskInThread", args: { threadId: "t1", title: "Do X" } }],
      candidates: [{ content: modelContent }],
    });

    const result = await generateWithTools("gemini-3.8-flash", [], {});

    expect(result.text).toBe("");
    expect(result.functionCalls).toEqual([{ name: "createTaskInThread", args: { threadId: "t1", title: "Do X" } }]);
    expect(result.modelContent).toEqual(modelContent);
  });

  it("returns an empty functionCalls array when the response has none", async () => {
    mockGenerateContent.mockResolvedValue({
      text: "just text",
      functionCalls: undefined,
      candidates: [{ content: { role: "model", parts: [{ text: "just text" }] } }],
    });

    const result = await generateWithTools("gemini-3.8-flash", [], {});

    expect(result.functionCalls).toEqual([]);
  });

  it("throws a clear error when GEMINI_API_KEY is not set", async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(generateWithTools("gemini-3.8-flash", [], {})).rejects.toThrow(
      "GEMINI_API_KEY is not set."
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/gemini.test.ts`
Expected: FAIL — `generateWithTools` is not exported from `@/lib/gemini`.

- [ ] **Step 3: Implement `generateWithTools`**

Replace the full contents of `lib/gemini.ts` with:

```ts
import { GoogleGenAI, type Content, type FunctionCall, type FunctionDeclaration } from "@google/genai";

export async function generateText(model: string, prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({ model, contents: prompt });
  return response.text ?? "";
}

export async function generateWithTools(
  model: string,
  contents: Content[],
  config: { systemInstruction?: string; tools?: FunctionDeclaration[] }
): Promise<{ text: string; functionCalls: FunctionCall[]; modelContent: Content }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: config.systemInstruction,
      tools: config.tools ? [{ functionDeclarations: config.tools }] : undefined,
    },
  });

  return {
    text: response.text ?? "",
    functionCalls: response.functionCalls ?? [],
    modelContent: response.candidates?.[0]?.content ?? { role: "model", parts: [] },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/gemini.test.ts`
Expected: PASS, all tests in both `describe` blocks (the original `generateText` tests must still pass unchanged).

- [ ] **Step 5: Run the full suite and commit**

Run: `npm test` — must stay green (175/175 or more, given the file already had tests; confirm no existing test broke).

```bash
git add lib/gemini.ts tests/unit/gemini.test.ts
git commit -m "feat: add generateWithTools to lib/gemini.ts for Gemini function-calling"
```

---

### Task 3: Jarvis tool schemas (`lib/jarvisTools.ts`)

Pure module — no DB, no network. Defines the five tool schemas Gemini will be given (four write tools + `findTasks`), and a TypeScript union type of valid tool names for the dispatcher in Task 6 to switch on exhaustively.

**Files:**
- Create: `lib/jarvisTools.ts`
- Test: `tests/unit/jarvisTools.test.ts`

**Interfaces:**
- Consumes: `FunctionDeclaration` type from `@google/genai` (already a dependency).
- Produces: `export const JARVIS_TOOLS: FunctionDeclaration[]`, `export type JarvisToolName = "createTaskInThread" | "createThreadWithTask" | "addTaskUpdate" | "updateTaskFields" | "findTasks"`. Task 6 imports both.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/jarvisTools.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { JARVIS_TOOLS } from "@/lib/jarvisTools";

describe("JARVIS_TOOLS", () => {
  it("declares exactly the five expected tools by name", () => {
    const names = JARVIS_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual(
      ["addTaskUpdate", "createTaskInThread", "createThreadWithTask", "findTasks", "updateTaskFields"].sort()
    );
  });

  it("every tool has a non-empty description", () => {
    for (const tool of JARVIS_TOOLS) {
      expect(tool.description).toBeTruthy();
    }
  });

  it("createTaskInThread requires threadId and title", () => {
    const tool = JARVIS_TOOLS.find((t) => t.name === "createTaskInThread")!;
    const schema = tool.parametersJsonSchema as { required: string[]; properties: Record<string, unknown> };
    expect(schema.required).toEqual(expect.arrayContaining(["threadId", "title"]));
    expect(schema.properties).toHaveProperty("threadId");
    expect(schema.properties).toHaveProperty("title");
    expect(schema.properties).toHaveProperty("description");
    expect(schema.properties).toHaveProperty("dueDate");
  });

  it("createThreadWithTask requires threadName and title, categoryColor is optional", () => {
    const tool = JARVIS_TOOLS.find((t) => t.name === "createThreadWithTask")!;
    const schema = tool.parametersJsonSchema as { required: string[]; properties: Record<string, unknown> };
    expect(schema.required).toEqual(expect.arrayContaining(["threadName", "title"]));
    expect(schema.required).not.toContain("categoryColor");
    expect(schema.properties).toHaveProperty("categoryColor");
  });

  it("addTaskUpdate requires taskId and body", () => {
    const tool = JARVIS_TOOLS.find((t) => t.name === "addTaskUpdate")!;
    const schema = tool.parametersJsonSchema as { required: string[] };
    expect(schema.required).toEqual(expect.arrayContaining(["taskId", "body"]));
  });

  it("updateTaskFields requires only taskId, status and priority are optional", () => {
    const tool = JARVIS_TOOLS.find((t) => t.name === "updateTaskFields")!;
    const schema = tool.parametersJsonSchema as { required: string[]; properties: Record<string, unknown> };
    expect(schema.required).toEqual(["taskId"]);
    expect(schema.properties).toHaveProperty("status");
    expect(schema.properties).toHaveProperty("priority");
  });

  it("findTasks requires query", () => {
    const tool = JARVIS_TOOLS.find((t) => t.name === "findTasks")!;
    const schema = tool.parametersJsonSchema as { required: string[] };
    expect(schema.required).toEqual(["query"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/jarvisTools.test.ts`
Expected: FAIL — `lib/jarvisTools.ts` does not exist.

- [ ] **Step 3: Implement**

Create `lib/jarvisTools.ts`:

```ts
import type { FunctionDeclaration } from "@google/genai";

export type JarvisToolName =
  | "createTaskInThread"
  | "createThreadWithTask"
  | "addTaskUpdate"
  | "updateTaskFields"
  | "findTasks";

export const JARVIS_TOOLS: FunctionDeclaration[] = [
  {
    name: "createTaskInThread",
    description:
      "Create a new task inside an existing thread. Use this when the user's message clearly matches one of the threads listed in the system context.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        threadId: { type: "string", description: "The id of the existing thread to create the task in, from the thread list in context." },
        title: { type: "string", description: "A short task title summarizing what needs to be done." },
        description: { type: "string", description: "Optional longer description of the task." },
        dueDate: { type: "string", description: "Optional due date in YYYY-MM-DD format." },
      },
      required: ["threadId", "title"],
    },
  },
  {
    name: "createThreadWithTask",
    description:
      "Create a brand-new thread and a first task in it. Use this only when the user's message clearly does not belong to any existing thread listed in context.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        threadName: { type: "string", description: "A short name for the new thread." },
        categoryColor: { type: "string", description: "Optional hex color for the thread, e.g. '#38e0ff'. Omit to use a default." },
        title: { type: "string", description: "A short task title for the first task in this new thread." },
        description: { type: "string", description: "Optional longer description of the task." },
        dueDate: { type: "string", description: "Optional due date in YYYY-MM-DD format." },
      },
      required: ["threadName", "title"],
    },
  },
  {
    name: "addTaskUpdate",
    description:
      "Log a progress comment on an existing task, without changing its status or priority. Use this for messages that describe progress on something already tracked. Use the findTasks tool first if you need to look up the task's id by name.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "The id of the existing task to comment on." },
        body: { type: "string", description: "The comment text." },
      },
      required: ["taskId", "body"],
    },
  },
  {
    name: "updateTaskFields",
    description:
      "Change an existing task's status and/or priority. Use this for messages that indicate a task is done, in progress, or has changed urgency. Use the findTasks tool first if you need to look up the task's id by name.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "The id of the existing task to update." },
        status: { type: "string", enum: ["TODO", "IN_PROGRESS", "DONE"], description: "Optional new work status." },
        priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"], description: "Optional new priority." },
      },
      required: ["taskId"],
    },
  },
  {
    name: "findTasks",
    description:
      "Search the user's own tasks by a text query matching the title or description. Use this to resolve a task mentioned by name/description to its id before calling addTaskUpdate or updateTaskFields. Returns up to 5 candidate matches with their ids, titles, and thread names.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to search for in task titles/descriptions." },
      },
      required: ["query"],
    },
  },
];
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/jarvisTools.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `npm test` — must stay green.

```bash
git add lib/jarvisTools.ts tests/unit/jarvisTools.test.ts
git commit -m "feat: define Jarvis tool schemas for Gemini function-calling"
```

---

### Task 4: Thread context + task search (`lib/jarvisContext.ts`)

**Files:**
- Create: `lib/jarvisContext.ts`
- Test: `tests/integration/jarvisContext.test.ts`

**Interfaces:**
- Consumes: `db` from `@/lib/db` (real DB in tests, per this project's integration-test convention — see `tests/integration/threadCalibration.test.ts` for the pattern this follows).
- Produces:
  - `export type JarvisThreadContext = { id: string; name: string; summary: string | null }`
  - `export async function getThreadsForJarvis(userId: string): Promise<JarvisThreadContext[]>`
  - `export type JarvisTaskMatch = { id: string; title: string; threadName: string }`
  - `export async function findTasksForJarvis(userId: string, query: string): Promise<JarvisTaskMatch[]>`

  Task 5 (prompt builder) consumes `JarvisThreadContext[]`. Task 7 (action orchestration) consumes both functions and `JarvisTaskMatch[]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/integration/jarvisContext.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { getThreadsForJarvis, findTasksForJarvis } from "@/lib/jarvisContext";

describe("getThreadsForJarvis", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  it("includes the user's own ACTIVE threads, with summary null when none exists", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    const thread = await db.thread.create({
      data: { ownerId: user.id, name: "Q3 Report", categoryColor: "#f2c14e" },
    });

    const result = await getThreadsForJarvis(user.id);

    expect(result).toEqual([{ id: thread.id, name: "Q3 Report", summary: null }]);
  });

  it("includes the thread's summaryText when a ThreadSummary exists", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    const thread = await db.thread.create({
      data: { ownerId: user.id, name: "Q3 Report", categoryColor: "#f2c14e" },
    });
    await db.threadSummary.create({
      data: { threadId: thread.id, summaryText: "Waiting on legal sign-off.", lastIncludedAt: new Date() },
    });

    const result = await getThreadsForJarvis(user.id);

    expect(result).toEqual([{ id: thread.id, name: "Q3 Report", summary: "Waiting on legal sign-off." }]);
  });

  it("includes threads shared with the user, and excludes threads owned/shared with someone else", async () => {
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const other = await db.user.create({ data: { email: "other@x.com", passwordHash: "x", name: "Other" } });
    const sharedThread = await db.thread.create({
      data: { ownerId: owner.id, name: "Shared With Me", categoryColor: "#38e0ff" },
    });
    await db.threadShare.create({
      data: { threadId: sharedThread.id, sharedWithUserId: other.id, permission: "EDITOR" },
    });
    await db.thread.create({
      data: { ownerId: owner.id, name: "Not Shared", categoryColor: "#38e0ff" },
    });

    const result = await getThreadsForJarvis(other.id);

    expect(result).toEqual([{ id: sharedThread.id, name: "Shared With Me", summary: null }]);
  });

  it("excludes ARCHIVED and DELETED threads", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    await db.thread.create({
      data: { ownerId: user.id, name: "Archived", categoryColor: "#38e0ff", status: "ARCHIVED" },
    });
    await db.thread.create({
      data: { ownerId: user.id, name: "Deleted", categoryColor: "#38e0ff", status: "DELETED", deletedAt: new Date() },
    });

    const result = await getThreadsForJarvis(user.id);

    expect(result).toEqual([]);
  });

  it("caps at 20 threads, most-recently-updated first", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    for (let i = 0; i < 22; i++) {
      await db.thread.create({ data: { ownerId: user.id, name: `Thread ${i}`, categoryColor: "#38e0ff" } });
    }

    const result = await getThreadsForJarvis(user.id);

    expect(result).toHaveLength(20);
    expect(result[0].name).toBe("Thread 21");
  });
});

describe("findTasksForJarvis", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  it("matches by title or description, case-insensitively, scoped to the user's own+shared threads", async () => {
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const stranger = await db.user.create({ data: { email: "stranger@x.com", passwordHash: "x", name: "Stranger" } });
    const thread = await db.thread.create({
      data: { ownerId: owner.id, name: "Q3 Report", categoryColor: "#f2c14e" },
    });
    const otherThread = await db.thread.create({
      data: { ownerId: stranger.id, name: "Not Mine", categoryColor: "#38e0ff" },
    });
    const match = await db.task.create({
      data: { primaryThreadId: thread.id, title: "Call the vendor about the invoice" },
    });
    await db.task.create({ data: { primaryThreadId: thread.id, title: "Unrelated task" } });
    await db.task.create({ data: { primaryThreadId: otherThread.id, title: "vendor call for someone else" } });

    const result = await findTasksForJarvis(owner.id, "vendor");

    expect(result).toEqual([{ id: match.id, title: "Call the vendor about the invoice", threadName: "Q3 Report" }]);
  });

  it("excludes DELETED tasks", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    const thread = await db.thread.create({ data: { ownerId: user.id, name: "T", categoryColor: "#38e0ff" } });
    await db.task.create({
      data: { primaryThreadId: thread.id, title: "vendor call", lifecycleStatus: "DELETED", deletedAt: new Date() },
    });

    const result = await findTasksForJarvis(user.id, "vendor");

    expect(result).toEqual([]);
  });

  it("caps at 5 matches", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    const thread = await db.thread.create({ data: { ownerId: user.id, name: "T", categoryColor: "#38e0ff" } });
    for (let i = 0; i < 7; i++) {
      await db.task.create({ data: { primaryThreadId: thread.id, title: `vendor call ${i}` } });
    }

    const result = await findTasksForJarvis(user.id, "vendor");

    expect(result).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/integration/jarvisContext.test.ts`
Expected: FAIL — `lib/jarvisContext.ts` does not exist.

- [ ] **Step 3: Implement**

Create `lib/jarvisContext.ts`:

```ts
import { db } from "@/lib/db";

export type JarvisThreadContext = { id: string; name: string; summary: string | null };

async function getVisibleThreadIds(userId: string): Promise<string[]> {
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
  return [...ownedThreads.map((t) => t.id), ...sharedThreads.map((t) => t.id)];
}

export async function getThreadsForJarvis(userId: string): Promise<JarvisThreadContext[]> {
  const threadIds = await getVisibleThreadIds(userId);

  const threads = await db.thread.findMany({
    where: { id: { in: threadIds } },
    include: { summary: true },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  return threads.map((t) => ({ id: t.id, name: t.name, summary: t.summary?.summaryText ?? null }));
}

export type JarvisTaskMatch = { id: string; title: string; threadName: string };

export async function findTasksForJarvis(userId: string, query: string): Promise<JarvisTaskMatch[]> {
  const threadIds = await getVisibleThreadIds(userId);

  const tasks = await db.task.findMany({
    where: {
      primaryThreadId: { in: threadIds },
      lifecycleStatus: "ACTIVE",
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ],
    },
    include: { primaryThread: true },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });

  return tasks.map((t) => ({ id: t.id, title: t.title, threadName: t.primaryThread.name }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/integration/jarvisContext.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `npm test` — must stay green.

```bash
git add lib/jarvisContext.ts tests/integration/jarvisContext.test.ts
git commit -m "feat: add thread-context and task-search queries for Jarvis"
```

---

### Task 5: System prompt builder (`lib/jarvisPrompt.ts`)

Pure function, no DB/network — mirrors `lib/priorityPrompt.ts`'s style.

**Files:**
- Create: `lib/jarvisPrompt.ts`
- Test: `tests/unit/jarvisPrompt.test.ts`

**Interfaces:**
- Consumes: `JarvisThreadContext` type from `@/lib/jarvisContext` (Task 4).
- Produces: `export function buildJarvisSystemPrompt(threads: JarvisThreadContext[]): string`. Task 6 consumes this.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/jarvisPrompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildJarvisSystemPrompt } from "@/lib/jarvisPrompt";

describe("buildJarvisSystemPrompt", () => {
  it("lists each thread's id, name, and summary when present", () => {
    const prompt = buildJarvisSystemPrompt([
      { id: "t1", name: "Q3 Report", summary: "Waiting on legal sign-off." },
      { id: "t2", name: "Onboarding", summary: null },
    ]);

    expect(prompt).toContain("t1");
    expect(prompt).toContain("Q3 Report");
    expect(prompt).toContain("Waiting on legal sign-off.");
    expect(prompt).toContain("t2");
    expect(prompt).toContain("Onboarding");
  });

  it("says explicitly when the user has no threads yet", () => {
    const prompt = buildJarvisSystemPrompt([]);

    expect(prompt.toLowerCase()).toContain("no threads yet");
  });

  it("instructs the model to prefer an existing thread over creating a new one", () => {
    const prompt = buildJarvisSystemPrompt([{ id: "t1", name: "Q3 Report", summary: null }]);

    expect(prompt.toLowerCase()).toContain("existing thread");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/jarvisPrompt.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `lib/jarvisPrompt.ts`:

```ts
import type { JarvisThreadContext } from "@/lib/jarvisContext";

export function buildJarvisSystemPrompt(threads: JarvisThreadContext[]): string {
  const lines: string[] = [];

  lines.push(
    "You are Jarvis, an assistant inside a task-tracking app called Arc. The user will send you free-form messages describing things they need to do, progress they've made, or changes to existing work. Decide what action fits and call the appropriate tool. Prefer matching an existing thread over creating a new one whenever the message plausibly relates to one. Only create a new thread when the message clearly doesn't fit any existing thread. Use the findTasks tool to resolve a task mentioned by name to its id before calling addTaskUpdate or updateTaskFields — never guess a task id. After taking any action, reply with a brief, friendly confirmation of what you did. If nothing needs to be done, just reply conversationally."
  );

  lines.push("", "The user's current threads:");
  if (threads.length === 0) {
    lines.push("(no threads yet — any new task will need a new thread)");
  } else {
    for (const t of threads) {
      lines.push(`- id: ${t.id} | name: "${t.name}" | summary: ${t.summary ?? "(no summary yet)"}`);
    }
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/jarvisPrompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `npm test` — must stay green.

```bash
git add lib/jarvisPrompt.ts tests/unit/jarvisPrompt.test.ts
git commit -m "feat: add Jarvis system-prompt builder"
```

---

### Task 6: Schema migration for `JarvisMessage`

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `tests/integration/schema-jarvis.test.ts`

**Interfaces:**
- Produces: `JarvisMessage` Prisma model, `db.jarvisMessage.*` client methods. Task 7 (`app/actions/jarvis.ts`) and `app/canvas/page.tsx` (Task 9) consume this.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/schema-jarvis.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";

describe("JarvisMessage schema", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  it("creates a USER message with no toolCalls by default", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });

    const message = await db.jarvisMessage.create({
      data: { userId: user.id, role: "USER", content: "call the vendor tomorrow" },
    });

    expect(message.role).toBe("USER");
    expect(message.content).toBe("call the vendor tomorrow");
    expect(message.toolCalls).toBeNull();
  });

  it("creates an ASSISTANT message with a toolCalls JSON payload", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });

    const message = await db.jarvisMessage.create({
      data: {
        userId: user.id,
        role: "ASSISTANT",
        content: "Created a task for that.",
        toolCalls: [{ tool: "createTaskInThread", success: true, summary: "Created task X in Y" }],
      },
    });

    expect(message.toolCalls).toEqual([{ tool: "createTaskInThread", success: true, summary: "Created task X in Y" }]);
  });

  it("orders messages by createdAt", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    await db.jarvisMessage.create({ data: { userId: user.id, role: "USER", content: "first" } });
    await db.jarvisMessage.create({ data: { userId: user.id, role: "ASSISTANT", content: "second" } });

    const messages = await db.jarvisMessage.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });

    expect(messages.map((m) => m.content)).toEqual(["first", "second"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/integration/schema-jarvis.test.ts`
Expected: FAIL — `db.jarvisMessage` does not exist (TypeScript compile error or runtime "not a function").

- [ ] **Step 3: Add the model to the schema**

In `prisma/schema.prisma`, add a new enum right after the existing `enum SharePermission { ... }` block:

```prisma
enum JarvisMessageRole {
  USER
  ASSISTANT
}
```

Add a new model at the end of the file, after `model ThreadSummary { ... }`:

```prisma
model JarvisMessage {
  id        String            @id @default(cuid())
  userId    String
  user      User              @relation(fields: [userId], references: [id])
  role      JarvisMessageRole
  content   String
  toolCalls Json?
  createdAt DateTime          @default(now())

  @@index([userId, createdAt])
}
```

Add the back-relation to `model User`, in the relations block alongside the existing ones (`ownedThreads`, `taskUpdates`, etc.):

```prisma
  jarvisMessages JarvisMessage[]
```

- [ ] **Step 4: Generate and apply the migration**

```bash
npx prisma migrate dev --name add_jarvis_message
npx prisma generate
```

Confirm the migration applied cleanly (the command output should say "Your database is now in sync with your schema" with no errors — this DB is the live Supabase instance shared across the project, same one every prior sub-project migrated against).

- [ ] **Step 5: Run to verify the test passes**

Run: `npx vitest run tests/integration/schema-jarvis.test.ts`
Expected: PASS.

- [ ] **Step 6: Full suite + commit**

Run: `npm test` — must stay green.

```bash
git add prisma/schema.prisma prisma/migrations tests/integration/schema-jarvis.test.ts
git commit -m "feat: add JarvisMessage model and migration"
```

---

### Task 7: `sendJarvisMessage` orchestration (`app/actions/jarvis.ts`)

This is the largest task: the tool-calling loop, per-tool dispatch/error-handling, message persistence, and the top-level Gemini-call failure fallback. Read the whole task before starting — the pieces are interdependent.

**Files:**
- Create: `lib/jarvisDispatch.ts` (per-tool execution logic — not a Server Action file, a plain module called by the action below)
- Create: `app/actions/jarvis.ts`
- Test: `tests/integration/jarvis.test.ts`

**Interfaces:**
- Consumes: `generateWithTools` (Task 2), `JARVIS_TOOLS`/`JarvisToolName` (Task 3), `getThreadsForJarvis`/`findTasksForJarvis`/`JarvisThreadContext` (Task 4), `buildJarvisSystemPrompt` (Task 5), `db.jarvisMessage` (Task 6), and the existing `createTask`/`updateTask` from `@/app/actions/tasks`, `createThread` from `@/app/actions/threads`, `addTaskUpdate` from `@/app/actions/taskUpdates`, `suggestTaskPriority` from `@/app/actions/taskPriority`, `PermissionError` from `@/lib/permissions`, `auth` from `@/lib/auth`.
- Produces: `export async function sendJarvisMessage(content: string): Promise<{ userMessage: JarvisMessage; assistantMessage: JarvisMessage }>` (types from `@prisma/client`). Task 8 (`JarvisPanel.tsx`) is the only consumer.

- [ ] **Step 1: Write the failing tests**

Create `tests/integration/jarvis.test.ts`:

```ts
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
    // Every round returns another tool call, never plain text — the loop must
    // not run forever.
    vi.mocked(generateWithTools).mockResolvedValue(toolCallResponse([{ name: "findTasks", args: { query: "x" } }]));

    const { assistantMessage } = await sendJarvisMessage("do something");

    expect(generateWithTools).toHaveBeenCalledTimes(4);
    expect(assistantMessage.content).toBeTruthy();
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/integration/jarvis.test.ts`
Expected: FAIL — `app/actions/jarvis.ts` does not exist.

- [ ] **Step 3: Implement the per-tool dispatcher**

Create `lib/jarvisDispatch.ts`:

```ts
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
```

- [ ] **Step 4: Implement `sendJarvisMessage`**

Create `app/actions/jarvis.ts`:

```ts
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
```

- [ ] **Step 5: Run to verify the tests pass**

Run: `npx vitest run tests/integration/jarvis.test.ts`
Expected: PASS, all 11 tests.

If the "resolves a task via findTasks" test's call count doesn't match, re-check the loop: round 1 (findTasks call) → round 2 (updateTaskFields call) → round 3 (plain text) is 3 `generateWithTools` calls total, matching the test's `toHaveBeenCalledTimes(3)`.

- [ ] **Step 6: Full suite + commit**

Run: `npm test` — must stay green.

```bash
git add lib/jarvisDispatch.ts app/actions/jarvis.ts tests/integration/jarvis.test.ts
git commit -m "feat: implement sendJarvisMessage tool-calling orchestration"
```

---

### Task 8: `JarvisPanel` UI component

**Files:**
- Create: `components/jarvis/JarvisPanel.tsx`
- Test: `tests/component/JarvisPanel.test.tsx`

**Interfaces:**
- Consumes: `sendJarvisMessage` from `@/app/actions/jarvis` (Task 7). Props: `initialMessages: { id: string; role: "USER" | "ASSISTANT"; content: string; toolCalls: { tool: string; success: boolean; summary: string }[] | null }[]`.
- Produces: `export default function JarvisPanel(props): JSX.Element`. Task 9 (Canvas.tsx wiring) is the only consumer.

- [ ] **Step 1: Write the failing tests**

Create `tests/component/JarvisPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import JarvisPanel from "@/components/jarvis/JarvisPanel";

vi.mock("@/app/actions/jarvis", () => ({ sendJarvisMessage: vi.fn() }));
import { sendJarvisMessage } from "@/app/actions/jarvis";

describe("JarvisPanel", () => {
  beforeEach(() => {
    vi.mocked(sendJarvisMessage).mockReset();
  });

  it("is collapsed by default and can be toggled open", () => {
    render(<JarvisPanel initialMessages={[]} />);

    expect(screen.queryByLabelText("Message Jarvis")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Jarvis" }));
    expect(screen.getByLabelText("Message Jarvis")).toBeInTheDocument();
  });

  it("renders initial messages, oldest first", () => {
    render(
      <JarvisPanel
        initialMessages={[
          { id: "1", role: "USER", content: "hi", toolCalls: null },
          { id: "2", role: "ASSISTANT", content: "hello!", toolCalls: null },
        ]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Jarvis" }));

    const messages = screen.getAllByTestId("jarvis-message");
    expect(messages.map((m) => m.textContent)).toEqual([expect.stringContaining("hi"), expect.stringContaining("hello!")]);
  });

  it("sends a message and appends both the user and assistant replies", async () => {
    vi.mocked(sendJarvisMessage).mockResolvedValue({
      userMessage: { id: "u1", role: "USER", content: "call the vendor", toolCalls: null } as never,
      assistantMessage: {
        id: "a1",
        role: "ASSISTANT",
        content: "Created that task.",
        toolCalls: [{ tool: "createTaskInThread", success: true, summary: "Created task X in Y" }],
      } as never,
    });
    render(<JarvisPanel initialMessages={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Jarvis" }));

    fireEvent.change(screen.getByLabelText("Message Jarvis"), { target: { value: "call the vendor" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText("Created that task.")).toBeInTheDocument());
    expect(screen.getByText("✓ Created task X in Y")).toBeInTheDocument();
    expect(sendJarvisMessage).toHaveBeenCalledWith("call the vendor");
  });

  it("shows a failed chip with an ✗ prefix", async () => {
    vi.mocked(sendJarvisMessage).mockResolvedValue({
      userMessage: { id: "u1", role: "USER", content: "x", toolCalls: null } as never,
      assistantMessage: {
        id: "a1",
        role: "ASSISTANT",
        content: "Couldn't do that.",
        toolCalls: [{ tool: "createTaskInThread", success: false, summary: "No access to that thread" }],
      } as never,
    });
    render(<JarvisPanel initialMessages={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Jarvis" }));

    fireEvent.change(screen.getByLabelText("Message Jarvis"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText("✗ No access to that thread")).toBeInTheDocument());
  });

  it("shows a visible error state when sendJarvisMessage rejects", async () => {
    vi.mocked(sendJarvisMessage).mockRejectedValue(new Error("network down"));
    render(<JarvisPanel initialMessages={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Jarvis" }));

    fireEvent.change(screen.getByLabelText("Message Jarvis"), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText(/couldn't reach jarvis/i)).toBeInTheDocument());
  });

  it("does not send an empty message", () => {
    render(<JarvisPanel initialMessages={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Jarvis" }));

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(sendJarvisMessage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/component/JarvisPanel.test.tsx`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement**

Create `components/jarvis/JarvisPanel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { sendJarvisMessage } from "@/app/actions/jarvis";

type ChipEntry = { tool: string; success: boolean; summary: string };
type JarvisMessageView = { id: string; role: "USER" | "ASSISTANT"; content: string; toolCalls: ChipEntry[] | null };

export default function JarvisPanel({ initialMessages }: { initialMessages: JarvisMessageView[] }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<JarvisMessageView[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setError(null);
    setSending(true);
    try {
      const { userMessage, assistantMessage } = await sendJarvisMessage(text);
      setMessages((prev) => [
        ...prev,
        { id: userMessage.id, role: "USER", content: userMessage.content, toolCalls: null },
        {
          id: assistantMessage.id,
          role: "ASSISTANT",
          content: assistantMessage.content,
          toolCalls: (assistantMessage.toolCalls as ChipEntry[] | null) ?? null,
        },
      ]);
    } catch {
      setError("Couldn't reach Jarvis — please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 20 }}>
      <button aria-label="Jarvis" onClick={() => setOpen((o) => !o)}>
        ◈ JARVIS
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Jarvis chat"
          style={{
            width: 320,
            maxHeight: 420,
            display: "flex",
            flexDirection: "column",
            background: "var(--panel-bg)",
            color: "var(--text)",
          }}
        >
          <div style={{ flex: 1, overflowY: "auto" }}>
            {messages.map((m) => (
              <div key={m.id} data-testid="jarvis-message">
                <strong>{m.role === "USER" ? "You" : "Jarvis"}:</strong> {m.content}
                {m.toolCalls?.map((c, i) => (
                  <div key={i}>
                    {c.success ? "✓" : "✗"} {c.summary}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {error && <div role="alert">{error}</div>}
          <textarea
            aria-label="Message Jarvis"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={sending}
          />
          <button onClick={handleSend} disabled={sending}>
            Send
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/component/JarvisPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `npm test` — must stay green.

```bash
git add components/jarvis/JarvisPanel.tsx tests/component/JarvisPanel.test.tsx
git commit -m "feat: add JarvisPanel chat UI component"
```

---

### Task 9: Wire `JarvisPanel` into the canvas

**Files:**
- Modify: `app/canvas/page.tsx`
- Modify: `components/canvas/Canvas.tsx`
- Modify: `tests/component/Canvas.test.tsx` (add the mock so existing tests don't break)

**Interfaces:**
- Consumes: `JarvisPanel` (Task 8), `db.jarvisMessage` (Task 6).
- Produces: nothing new consumed elsewhere — this is the final integration point.

- [ ] **Step 1: Update `app/canvas/page.tsx`**

Add a query for the user's recent Jarvis messages and pass them to `Canvas`. Insert after the existing `taskPositions`/`positions` block and before the `return`:

```ts
  const jarvisMessages = await db.jarvisMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
```

Add `jarvisMessages` to the `<Canvas ... />` props, mapping to the plain shape `JarvisPanel` expects:

```ts
      initialJarvisMessages={jarvisMessages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls as { tool: string; success: boolean; summary: string }[] | null,
      }))}
```

- [ ] **Step 2: Update `components/canvas/Canvas.tsx`**

Add the import near the other component imports (after `import CatchUpModal from "./CatchUpModal";`):

```ts
import JarvisPanel from "@/components/jarvis/JarvisPanel";
```

Add `initialJarvisMessages` to the `CanvasInner` props type (alongside `preferredAiModel`):

```ts
  initialJarvisMessages: {
    id: string;
    role: "USER" | "ASSISTANT";
    content: string;
    toolCalls: { tool: string; success: boolean; summary: string }[] | null;
  }[];
```

and to the destructured parameter list. Render the panel once, anywhere inside `CanvasInner`'s returned JSX tree (it's `position: fixed` internally, so placement in the tree doesn't affect layout) — add it as a sibling near the closing of the outer wrapping `<div>`:

```tsx
      <JarvisPanel initialMessages={initialJarvisMessages} />
```

The outer exported `Canvas` component (`components/canvas/Canvas.tsx:563`, wrapping `CanvasInner` in `ReactFlowProvider`) forwards its props to `CanvasInner` via `<CanvasInner {...props} />` — a plain spread, not individually destructured fields. So it does NOT need a matching destructured parameter added; it only needs `initialJarvisMessages` added to its own inline props type annotation (the `props: { threads: ...; tasks: ...; ...; initialTier?: ... }` object type at line 563-575) so TypeScript accepts the field being passed in and the spread satisfies `CanvasInner`'s prop type. Add it there, matching the same shape used for `CanvasInner` above.

- [ ] **Step 3: Update `tests/component/Canvas.test.tsx`**

Add this mock alongside the other `vi.mock("@/app/actions/...")` calls near the top of the file (Canvas now renders `JarvisPanel`, which calls `sendJarvisMessage` — every existing Canvas test that renders the full component needs this mocked so it doesn't attempt a real call):

```ts
vi.mock("@/app/actions/jarvis", () => ({ sendJarvisMessage: vi.fn() }));
```

Find every place in the file that renders `<Canvas ... />` with a props object (search for `render(<Canvas` — there are likely several, one per `describe`/`it` block using a shared `defaultThemeProps`-style fixture, per the pattern already in the file for `preferredAiModel`). Add `initialJarvisMessages: []` to that shared props fixture so every existing render call picks it up without editing each call site individually.

- [ ] **Step 4: Run the full suite**

Run: `npm test` — must stay green. Pay particular attention to `tests/component/Canvas.test.tsx` — if any existing test now fails because `initialJarvisMessages` is missing from a props object the shared fixture didn't cover, add it at that call site directly.

- [ ] **Step 5: Manual verification**

Start the dev server and confirm the Jarvis toggle button appears on the canvas page and the panel opens/closes:

```bash
npm run dev
```

Then use the Browser tool to navigate to `http://localhost:3089`, sign up/log in, and click the "◈ JARVIS" button to confirm the panel opens. Stop the dev server afterward.

- [ ] **Step 6: Commit**

```bash
git add app/canvas/page.tsx components/canvas/Canvas.tsx tests/component/Canvas.test.tsx
git commit -m "feat: wire JarvisPanel into the canvas page"
```

---

### Task 10: End-to-end test against the real Gemini API

**Files:**
- Create: `tests/e2e/jarvis-flow.spec.ts`

**Interfaces:**
- Consumes: the full running app (real DB, real Gemini API via the signed-up test user's default `preferredAiModel`).

- [ ] **Step 1: Write the test**

Create `tests/e2e/jarvis-flow.spec.ts`, following the structure and retry rationale already established in `tests/e2e/ai-prioritization-flow.spec.ts` (real network call to Gemini, so this file alone gets `test.describe.configure({ retries: 2 })` for the same transient-503 reason documented there — do not add retries to `playwright.config.ts` globally):

```ts
import { test, expect } from "@playwright/test";

// End-to-end test for Jarvis: a chat message that clearly names a new,
// never-before-seen project should result in Jarvis creating a new thread
// and a task inside it via the real Gemini API (using the signed-up test
// user's default preferredAiModel, gemini-3.8-flash — confirmed live and
// working as of the dead-preset-model fix in the prior sub-project).
//
// This deliberately does not assert on Jarvis's exact reply wording (model
// output is non-deterministic) — only on the resulting task appearing on
// the canvas, which is the observable, model-independent behavior.
test.describe.configure({ retries: 2 });

test("Jarvis creates a new thread and task from a chat message", async ({ page }) => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `jarvis-${runId}@example.com`;

  await test.step("sign up and land on the canvas", async () => {
    await page.goto("/signup");
    await page.getByPlaceholder("Name").fill("Jarvis Tester");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill("correcthorse123");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/canvas/);
  });

  await test.step("open Jarvis and send a message describing brand-new work", async () => {
    await page.getByRole("button", { name: "Jarvis" }).click();
    await page.getByLabel("Message Jarvis").fill(
      "Start tracking a brand new initiative called Rocket Launch Prep — first thing to do is book the venue."
    );
    await page.getByRole("button", { name: "Send" }).click();
  });

  await test.step("Jarvis's reply and a success chip appear", async () => {
    await expect(page.getByRole("dialog", { name: "Jarvis chat" }).getByText(/./)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/✓/)).toBeVisible({ timeout: 30000 });
  });

  await test.step("the new thread and task appear on the canvas", async () => {
    await expect(page.getByText("Rocket Launch Prep")).toBeVisible({ timeout: 10000 });
  });
});
```

- [ ] **Step 2: Run it**

```bash
npx playwright test tests/e2e/jarvis-flow.spec.ts --reporter=list
```

Expected: PASS. If it fails on the exact thread/task name matching (the model may not echo "Rocket Launch Prep" verbatim as the thread name), loosen the last assertion to check for a new thread bubble appearing at all (e.g. assert the total thread count increased by one, read from the page before/after) rather than an exact name match — real model output for a *name* is more deterministic than for a *priority level* (sub-project 3's tests avoided asserting exact AI output for that reason), but confirm this empirically against the real API rather than assuming; adjust the assertion to whatever is actually true, documenting the choice in a comment the way `ai-prioritization-flow.spec.ts` does.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/jarvis-flow.spec.ts
git commit -m "test: add end-to-end coverage for Jarvis chat-to-action flow"
```

---

## After all tasks

Once all 10 tasks are complete and the full suite (`npm test` + `npx playwright test`) is green, proceed to a final whole-branch review (most capable model available) per `superpowers:subagent-driven-development`, then `superpowers:finishing-a-development-branch` to merge — following the exact same pattern used for sub-projects 2 and 3.
