# Jarvis Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Jarvis's small bottom-right popup with a full-screen, Claude-like workspace — a left sidebar of chat sessions, a center chat pane, and the existing canvas visible on the right — plus per-message/per-session token-usage tracking, a loading indicator, and a themed scrollbar.

**Architecture:** `JarvisPanel` shrinks to just the floating trigger button. Clicking it flips a `jarvisWorkspaceOpen` boolean owned by `Canvas.tsx`, which (a) mounts `JarvisWorkspace` — a `fixed inset-0 z-[110]` overlay containing `JarvisSessionList` (left) and `JarvisChat` (center) — and (b) squeezes the *same* mounted `<ReactFlow>` instance into a `fixed`, right-pinned strip at `z-[115]` via a CSS class swap, so it visually reads as "canvas on the right" without remounting React Flow (preserving zoom/pan state). `JarvisMessage` gains a required `sessionId` FK to a new `JarvisSession` model and three nullable token-count columns.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4, Prisma 7 + Postgres, `@google/genai`, Vitest + React Testing Library, Playwright.

## Global Constraints

- Every `var()` reference in new/touched JSX carries a dark-mode fallback matching `lib/theme.ts`'s DARK output: `--bg:#0a0e14`, `--panel-bg:rgba(15,25,35,0.85)`, `--text:#eafcff`, `--accent:#38e0ff`.
- New dialogs/overlays must not regress the z-index lessons already paid for in this codebase: a `position: fixed` element does **not** escape an ancestor stacking context created by a numeric `z-index` — `Modal`'s z-index must clear both `JarvisWorkspace` (z-[110]) and the resized canvas strip (z-[115]) it's usually triggered from within.
- Existing Jarvis message history is **not** migrated into sessions — it is dropped (explicit decision; this is dev-only data with no production deployment).
- No AI-generated session titles — truncate the first user message instead (explicit decision, avoids an extra billed Gemini call per new chat).
- The right-side canvas preview shows the **full** canvas (all threads/tasks), not scoped to the active session (explicit decision).
- Gemini itself stays mocked in all component/integration tests (`vi.mock("@/lib/gemini", ...)`), matching existing convention — no real API calls in the test suite.
- Every accessible name Playwright's e2e suite currently depends on outside Jarvis (`"New thread"`, `"Share"`, etc.) is unaffected by this plan — only `tests/e2e/jarvis-flow.spec.ts` itself changes.

---

### Task 1: Schema — `JarvisSession` model, `JarvisMessage` gets `sessionId` + token columns

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `tests/helpers/resetDb.ts`
- Modify: `tests/integration/schema-jarvis.test.ts`

**Interfaces:**
- Produces: `JarvisSession { id, userId, title: String?, createdAt, updatedAt }`; `JarvisMessage` gains `sessionId: String` (FK, cascade delete), `promptTokens: Int?`, `completionTokens: Int?`, `totalTokens: Int?`.

**Named risk:** Adding a required `sessionId` column to a table with existing rows fails unless the table is empty first — clear it explicitly before migrating (see Step 2), don't rely on `prisma migrate dev`'s interactive prompt (it can hang a non-interactive shell).

- [ ] **Step 1: Update the schema**

In `prisma/schema.prisma`, find the `User` model and add one line next to the existing `jarvisMessages` relation:

```prisma
model User {
  // ...unchanged fields above...
  jarvisMessages JarvisMessage[]
  jarvisSessions JarvisSession[]
}
```

Replace the existing `model JarvisMessage { ... }` block with:

```prisma
model JarvisSession {
  id        String          @id @default(cuid())
  userId    String
  user      User            @relation(fields: [userId], references: [id])
  title     String?
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt
  messages  JarvisMessage[]

  @@index([userId, updatedAt])
}

model JarvisMessage {
  id               String            @id @default(cuid())
  sessionId        String
  session          JarvisSession     @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  userId           String
  user             User              @relation(fields: [userId], references: [id])
  role             JarvisMessageRole
  content          String
  toolCalls        Json?
  promptTokens     Int?
  completionTokens Int?
  totalTokens      Int?
  createdAt        DateTime          @default(now())

  @@index([sessionId, createdAt])
}
```

- [ ] **Step 2: Clear existing Jarvis history (explicit decision: it is not migrated)**

Run from the worktree root:

```bash
node -e "
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
prisma.jarvisMessage.deleteMany({}).then((r) => { console.log('Deleted', r.count, 'old JarvisMessage rows'); return prisma.\$disconnect(); });
"
```

Expected: prints `Deleted N old JarvisMessage rows` (N may be 0).

- [ ] **Step 3: Run the migration**

```bash
npx prisma migrate dev --name add_jarvis_sessions
```

Expected: succeeds without a data-loss prompt (the table is empty from Step 2). Prisma Client regenerates automatically.

- [ ] **Step 4: Update `resetDb.ts`**

In `tests/helpers/resetDb.ts`, add a line for the new table — it must come after `jarvisMessage.deleteMany()` (FK) and before `user.deleteMany()`:

```ts
import { db } from "@/lib/db";

export async function resetDb() {
  await db.taskUpdate.deleteMany();
  await db.taskPosition.deleteMany();
  await db.taskThreadLink.deleteMany();
  await db.threadShare.deleteMany();
  await db.threadView.deleteMany();
  await db.threadSummary.deleteMany();
  await db.task.deleteMany();
  await db.thread.deleteMany();
  await db.jarvisMessage.deleteMany();
  await db.jarvisSession.deleteMany();
  await db.user.deleteMany();
}
```

- [ ] **Step 5: Update the schema test**

Replace `tests/integration/schema-jarvis.test.ts` with:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";

describe("JarvisSession / JarvisMessage schema", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  it("creates a session with a null title by default", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });

    const session = await db.jarvisSession.create({ data: { userId: user.id } });

    expect(session.title).toBeNull();
    expect(session.userId).toBe(user.id);
  });

  it("creates a USER message with no toolCalls or token counts by default", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    const session = await db.jarvisSession.create({ data: { userId: user.id } });

    const message = await db.jarvisMessage.create({
      data: { sessionId: session.id, userId: user.id, role: "USER", content: "call the vendor tomorrow" },
    });

    expect(message.content).toBe("call the vendor tomorrow");
    expect(message.toolCalls).toBeNull();
    expect(message.totalTokens).toBeNull();
  });

  it("creates an ASSISTANT message with a toolCalls JSON payload and token counts", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    const session = await db.jarvisSession.create({ data: { userId: user.id } });

    const message = await db.jarvisMessage.create({
      data: {
        sessionId: session.id,
        userId: user.id,
        role: "ASSISTANT",
        content: "Created a task for that.",
        toolCalls: [{ tool: "createTaskInThread", success: true, summary: "Created task X in Y" }],
        promptTokens: 50,
        completionTokens: 12,
        totalTokens: 62,
      },
    });

    expect(message.toolCalls).toEqual([{ tool: "createTaskInThread", success: true, summary: "Created task X in Y" }]);
    expect(message.totalTokens).toBe(62);
  });

  it("orders a session's messages by createdAt", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    const session = await db.jarvisSession.create({ data: { userId: user.id } });
    await db.jarvisMessage.create({ data: { sessionId: session.id, userId: user.id, role: "USER", content: "first" } });
    await db.jarvisMessage.create({ data: { sessionId: session.id, userId: user.id, role: "ASSISTANT", content: "second" } });

    const messages = await db.jarvisMessage.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: "asc" } });

    expect(messages.map((m) => m.content)).toEqual(["first", "second"]);
  });

  it("cascades: deleting a session deletes its messages", async () => {
    const user = await db.user.create({ data: { email: "a@x.com", passwordHash: "x", name: "A" } });
    const session = await db.jarvisSession.create({ data: { userId: user.id } });
    await db.jarvisMessage.create({ data: { sessionId: session.id, userId: user.id, role: "USER", content: "hi" } });

    await db.jarvisSession.delete({ where: { id: session.id } });

    const remaining = await db.jarvisMessage.findMany({ where: { sessionId: session.id } });
    expect(remaining).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Run the test and commit**

```bash
npm test -- tests/integration/schema-jarvis.test.ts
```

Expected: PASS (5 tests).

```bash
git add prisma/schema.prisma prisma/migrations tests/helpers/resetDb.ts tests/integration/schema-jarvis.test.ts
git commit -m "feat: add JarvisSession model, sessionId + token columns on JarvisMessage"
```

---

### Task 2: `lib/gemini.ts` — return token usage from `generateWithTools`

**Files:**
- Modify: `lib/gemini.ts`
- Modify: `tests/unit/gemini.test.ts`

**Interfaces:**
- Produces: `generateWithTools(...)` now resolves `{ text, functionCalls, modelContent, usage: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number } }`.

- [ ] **Step 1: Update `generateWithTools`**

In `lib/gemini.ts`, replace the function with:

```ts
export async function generateWithTools(
  model: string,
  contents: Content[],
  config: { systemInstruction?: string; tools?: FunctionDeclaration[] }
): Promise<{
  text: string;
  functionCalls: FunctionCall[];
  modelContent: Content;
  usage: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number };
}> {
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
    usage: {
      promptTokenCount: response.usageMetadata?.promptTokenCount ?? 0,
      candidatesTokenCount: response.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokenCount: response.usageMetadata?.totalTokenCount ?? 0,
    },
  };
}
```

- [ ] **Step 2: Update the tests**

In `tests/unit/gemini.test.ts`, replace the `"returns text, functionCalls, and modelContent from the response"` test with two tests (add `usageMetadata` to the existing mock, plus a new default-to-zero case):

```ts
  it("returns text, functionCalls, modelContent, and usage from the response", async () => {
    const modelContent = {
      role: "model",
      parts: [{ functionCall: { name: "createTaskInThread", args: { threadId: "t1", title: "Do X" } } }],
    };
    mockGenerateContent.mockResolvedValue({
      text: undefined,
      functionCalls: [{ name: "createTaskInThread", args: { threadId: "t1", title: "Do X" } }],
      candidates: [{ content: modelContent }],
      usageMetadata: { promptTokenCount: 76, candidatesTokenCount: 28, totalTokenCount: 104 },
    });

    const result = await generateWithTools("gemini-3.8-flash", [], {});

    expect(result.text).toBe("");
    expect(result.functionCalls).toEqual([{ name: "createTaskInThread", args: { threadId: "t1", title: "Do X" } }]);
    expect(result.modelContent).toEqual(modelContent);
    expect(result.usage).toEqual({ promptTokenCount: 76, candidatesTokenCount: 28, totalTokenCount: 104 });
  });

  it("defaults usage counts to 0 when usageMetadata is missing", async () => {
    mockGenerateContent.mockResolvedValue({
      text: "just text",
      functionCalls: undefined,
      candidates: [{ content: { role: "model", parts: [{ text: "just text" }] } }],
    });

    const result = await generateWithTools("gemini-3.8-flash", [], {});

    expect(result.usage).toEqual({ promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 });
  });
```

- [ ] **Step 3: Run tests and commit**

```bash
npm test -- tests/unit/gemini.test.ts
```

Expected: PASS (7 tests).

```bash
git add lib/gemini.ts tests/unit/gemini.test.ts
git commit -m "feat: return token usage metadata from generateWithTools"
```

---

### Task 3: `app/actions/jarvisSessions.ts` — session CRUD server actions

**Files:**
- Create: `app/actions/jarvisSessions.ts`
- Create: `tests/integration/jarvisSessions.test.ts`

**Interfaces:**
- Consumes: `lib/db.ts`'s `db`, `lib/auth.ts`'s `auth`, `lib/permissions.ts`'s `PermissionError`.
- Produces: `createJarvisSession()`, `listJarvisSessions()`, `renameJarvisSession(sessionId, title)`, `deleteJarvisSession(sessionId)`, `listJarvisMessages(sessionId)` — all consumed by Task 8's `JarvisWorkspace.tsx`.

- [ ] **Step 1: Write the actions**

```ts
// app/actions/jarvisSessions.ts
"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";

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

export async function createJarvisSession() {
  const userId = await requireUserId();
  return db.jarvisSession.create({ data: { userId } });
}

export async function listJarvisSessions() {
  const userId = await requireUserId();
  return db.jarvisSession.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
  });
}

export async function renameJarvisSession(sessionId: string, title: string) {
  const userId = await requireUserId();
  await requireOwnJarvisSession(sessionId, userId);
  const trimmed = title.trim();
  await db.jarvisSession.update({ where: { id: sessionId }, data: { title: trimmed === "" ? null : trimmed } });
}

export async function deleteJarvisSession(sessionId: string) {
  const userId = await requireUserId();
  await requireOwnJarvisSession(sessionId, userId);
  await db.jarvisSession.delete({ where: { id: sessionId } });
}

export async function listJarvisMessages(sessionId: string) {
  const userId = await requireUserId();
  await requireOwnJarvisSession(sessionId, userId);
  return db.jarvisMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, toolCalls: true, totalTokens: true },
  });
}
```

- [ ] **Step 2: Write integration tests**

```ts
// tests/integration/jarvisSessions.test.ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { PermissionError } from "@/lib/permissions";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

import {
  createJarvisSession,
  listJarvisSessions,
  renameJarvisSession,
  deleteJarvisSession,
  listJarvisMessages,
} from "@/app/actions/jarvisSessions";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("jarvisSessions actions", () => {
  let ownerId: string;
  let otherId: string;

  beforeEach(async () => {
    await resetDb();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const other = await db.user.create({ data: { email: "other@x.com", passwordHash: "x", name: "Other" } });
    ownerId = owner.id;
    otherId = other.id;
  });
  afterAll(async () => db.$disconnect());

  it("creates a session with a null title", async () => {
    await loginAs(ownerId);
    const session = await createJarvisSession();
    expect(session.title).toBeNull();
    expect(session.userId).toBe(ownerId);
  });

  it("lists only the current user's sessions, most recently updated first", async () => {
    await loginAs(ownerId);
    const first = await createJarvisSession();
    const second = await createJarvisSession();
    await loginAs(otherId);
    await createJarvisSession();

    await loginAs(ownerId);
    const sessions = await listJarvisSessions();

    expect(sessions.map((s) => s.id).sort()).toEqual([first.id, second.id].sort());
  });

  it("renames a session, and an empty title clears it back to null", async () => {
    await loginAs(ownerId);
    const session = await createJarvisSession();

    await renameJarvisSession(session.id, "Rocket Launch Prep");
    let sessions = await listJarvisSessions();
    expect(sessions.find((s) => s.id === session.id)?.title).toBe("Rocket Launch Prep");

    await renameJarvisSession(session.id, "   ");
    sessions = await listJarvisSessions();
    expect(sessions.find((s) => s.id === session.id)?.title).toBeNull();
  });

  it("a user cannot rename another user's session", async () => {
    await loginAs(ownerId);
    const session = await createJarvisSession();

    await loginAs(otherId);
    await expect(renameJarvisSession(session.id, "Sneaky")).rejects.toThrow(PermissionError);
  });

  it("deletes a session and cascades its messages", async () => {
    await loginAs(ownerId);
    const session = await createJarvisSession();
    await db.jarvisMessage.create({ data: { sessionId: session.id, userId: ownerId, role: "USER", content: "hi" } });

    await deleteJarvisSession(session.id);

    const sessions = await listJarvisSessions();
    expect(sessions).toHaveLength(0);
    const messages = await db.jarvisMessage.findMany({ where: { sessionId: session.id } });
    expect(messages).toHaveLength(0);
  });

  it("a user cannot delete another user's session", async () => {
    await loginAs(ownerId);
    const session = await createJarvisSession();

    await loginAs(otherId);
    await expect(deleteJarvisSession(session.id)).rejects.toThrow(PermissionError);
  });

  it("lists a session's messages in order, with only the current user's own session readable", async () => {
    await loginAs(ownerId);
    const session = await createJarvisSession();
    await db.jarvisMessage.create({ data: { sessionId: session.id, userId: ownerId, role: "USER", content: "first" } });
    await db.jarvisMessage.create({ data: { sessionId: session.id, userId: ownerId, role: "ASSISTANT", content: "second" } });

    const messages = await listJarvisMessages(session.id);
    expect(messages.map((m) => m.content)).toEqual(["first", "second"]);

    await loginAs(otherId);
    await expect(listJarvisMessages(session.id)).rejects.toThrow(PermissionError);
  });

  it("requires being logged in", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(createJarvisSession()).rejects.toThrow(PermissionError);
  });
});
```

- [ ] **Step 3: Run tests and commit**

```bash
npm test -- tests/integration/jarvisSessions.test.ts
```

Expected: PASS (8 tests).

```bash
git add app/actions/jarvisSessions.ts tests/integration/jarvisSessions.test.ts
git commit -m "feat: add jarvisSessions server actions (create/list/rename/delete/listMessages)"
```

---

### Task 4: `app/actions/jarvis.ts` — session-scoped `sendJarvisMessage`, auto-title, token summation

**Files:**
- Modify: `app/actions/jarvis.ts`
- Modify: `tests/integration/jarvis.test.ts`

**Interfaces:**
- Consumes: Task 2's `generateWithTools(...).usage`; Task 3's `JarvisSession` model directly via `db`.
- Produces: `sendJarvisMessage(sessionId: string, content: string)` (signature change — every existing call site changes from 1 arg to 2).

**Named risk:** the try/catch around the tool-calling loop must NOT persist token counts accumulated before a mid-loop failure — a partial/failed turn's usage isn't attributable to "this reply" (explicit design decision). Only write token fields when the loop actually completes.

- [ ] **Step 1: Confirm the current behavior this preserves**

Run: `npm test -- tests/integration/jarvis.test.ts`
Expected: PASS (13 tests) — this is the baseline every rewritten test below must still cover.

- [ ] **Step 2: Rewrite `app/actions/jarvis.ts`**

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
```

- [ ] **Step 3: Update `tests/integration/jarvis.test.ts`**

Every existing `sendJarvisMessage("...")` call becomes `sendJarvisMessage(sessionId, "...")`. Add a `sessionId` variable created in `beforeEach` (alongside the existing `thread`), and add 3 new tests. The full rewritten file:

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

const ZERO_USAGE = { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 };

function textOnlyResponse(text: string, usage = ZERO_USAGE) {
  return {
    text,
    functionCalls: [],
    modelContent: { role: "model", parts: [{ text }] },
    usage,
  };
}

function toolCallResponse(calls: { name: string; args: Record<string, unknown> }[], usage = ZERO_USAGE) {
  return {
    text: "",
    functionCalls: calls,
    modelContent: { role: "model", parts: calls.map((c) => ({ functionCall: c })) },
    usage,
  };
}

describe("sendJarvisMessage", () => {
  let ownerId: string;
  let viewerId: string;
  let threadId: string;
  let sessionId: string;

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
    const session = await db.jarvisSession.create({ data: { userId: ownerId } });
    sessionId = session.id;
  });
  afterAll(async () => db.$disconnect());

  it("persists the user message and a plain-text assistant reply when no tools are called", async () => {
    await loginAs(ownerId);
    vi.mocked(generateWithTools).mockResolvedValueOnce(textOnlyResponse("Sure, happy to help!"));

    const { userMessage, assistantMessage } = await sendJarvisMessage(sessionId, "hey there");

    expect(userMessage.role).toBe("USER");
    expect(userMessage.content).toBe("hey there");
    expect(assistantMessage.role).toBe("ASSISTANT");
    expect(assistantMessage.content).toBe("Sure, happy to help!");
    expect(assistantMessage.toolCalls).toBeNull();

    const stored = await db.jarvisMessage.findMany({ where: { sessionId } });
    expect(stored).toHaveLength(2);
  });

  it("creates a task via createTaskInThread and records a success chip", async () => {
    await loginAs(ownerId);
    vi.mocked(generateWithTools)
      .mockResolvedValueOnce(
        toolCallResponse([{ name: "createTaskInThread", args: { threadId, title: "Call the vendor" } }])
      )
      .mockResolvedValueOnce(textOnlyResponse("Created that task for you."));

    const { assistantMessage } = await sendJarvisMessage(sessionId, "call the vendor about the invoice");

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

  it("falls back to a chip-summary reply when the final round's text is empty", async () => {
    await loginAs(ownerId);
    vi.mocked(generateWithTools)
      .mockResolvedValueOnce(
        toolCallResponse([{ name: "createTaskInThread", args: { threadId, title: "Call the vendor" } }])
      )
      .mockResolvedValueOnce({ text: "", functionCalls: [], modelContent: { role: "model", parts: [] }, usage: ZERO_USAGE });

    const { assistantMessage } = await sendJarvisMessage(sessionId, "call the vendor about the invoice");

    expect(assistantMessage.content).toBeTruthy();
    expect(assistantMessage.content).not.toMatch(/something went wrong/i);
    const toolCalls = assistantMessage.toolCalls as { tool: string; success: boolean; summary: string }[];
    expect(toolCalls).toHaveLength(1);
    expect(assistantMessage.content).toContain(toolCalls[0].summary);
  });

  it("creates a new thread and task via createThreadWithTask", async () => {
    await loginAs(ownerId);
    vi.mocked(generateWithTools)
      .mockResolvedValueOnce(
        toolCallResponse([{ name: "createThreadWithTask", args: { threadName: "New Project", title: "Kick off" } }])
      )
      .mockResolvedValueOnce(textOnlyResponse("Started a new thread for that."));

    await sendJarvisMessage(sessionId, "start tracking the new project");

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

    await sendJarvisMessage(sessionId, "I left a voicemail for the vendor");

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

    await sendJarvisMessage(sessionId, "finished the vendor call");

    const updated = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.workStatus).toBe("DONE");
  });

  it("updateTaskFields with neither status nor priority fails with a chip and makes no DB write", async () => {
    await loginAs(ownerId);
    const task = await createTask({ primaryThreadId: threadId, title: "Call the vendor" });
    vi.mocked(generateWithTools)
      .mockResolvedValueOnce(toolCallResponse([{ name: "updateTaskFields", args: { taskId: task.id } }]))
      .mockResolvedValueOnce(textOnlyResponse("I need a status or priority to update."));

    const { assistantMessage } = await sendJarvisMessage(sessionId, "update the vendor task");

    const unchanged = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(unchanged.workStatus).toBe(task.workStatus);
    expect(unchanged.priority).toBe(task.priority);

    const toolCalls = assistantMessage.toolCalls as { tool: string; success: boolean; summary: string }[];
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toMatchObject({ tool: "updateTaskFields", success: false });
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

    const { assistantMessage } = await sendJarvisMessage(sessionId, "finished the vendor thing");

    const updated = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.workStatus).toBe("DONE");
    const toolCalls = assistantMessage.toolCalls as { tool: string }[];
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].tool).toBe("updateTaskFields");
    expect(generateWithTools).toHaveBeenCalledTimes(3);
  });

  it("a tool call against a thread the user can't edit fails with a chip, not a thrown error", async () => {
    await loginAs(viewerId);
    const viewerSession = await db.jarvisSession.create({ data: { userId: viewerId } });
    vi.mocked(generateWithTools)
      .mockResolvedValueOnce(
        toolCallResponse([{ name: "createTaskInThread", args: { threadId, title: "Sneaky task" } }])
      )
      .mockResolvedValueOnce(textOnlyResponse("I couldn't do that — you only have view access there."));

    const { assistantMessage } = await sendJarvisMessage(viewerSession.id, "add a task to Q3 Report");

    const tasks = await db.task.findMany({ where: { primaryThreadId: threadId } });
    expect(tasks).toHaveLength(0);
    const toolCalls = assistantMessage.toolCalls as { tool: string; success: boolean }[];
    expect(toolCalls[0]).toMatchObject({ tool: "createTaskInThread", success: false });
  });

  it("stops the loop after 4 rounds and still returns a reply", async () => {
    await loginAs(ownerId);
    vi.mocked(generateWithTools)
      .mockResolvedValueOnce(toolCallResponse([{ name: "findTasks", args: { query: "x" } }]))
      .mockResolvedValueOnce(toolCallResponse([{ name: "findTasks", args: { query: "x" } }]))
      .mockResolvedValueOnce(toolCallResponse([{ name: "findTasks", args: { query: "x" } }]))
      .mockResolvedValueOnce(textOnlyResponse("I couldn't pin that down — could you clarify?"));

    const { assistantMessage } = await sendJarvisMessage(sessionId, "do something");

    expect(generateWithTools).toHaveBeenCalledTimes(4);
    expect(assistantMessage.content).toBe("I couldn't pin that down — could you clarify?");
    const roundOneConfig = vi.mocked(generateWithTools).mock.calls[0][2];
    const roundFourConfig = vi.mocked(generateWithTools).mock.calls[3][2];
    expect(roundOneConfig.tools).toBeDefined();
    expect(roundFourConfig.tools).toBeUndefined();
  });

  it("stops the loop after 4 rounds and summarizes accumulated actions when some succeeded", async () => {
    await loginAs(ownerId);
    const task = await createTask({ primaryThreadId: threadId, title: "Call the vendor" });
    vi.mocked(generateWithTools).mockResolvedValue(
      toolCallResponse([{ name: "updateTaskFields", args: { taskId: task.id, status: "DONE" } }])
    );

    const { assistantMessage } = await sendJarvisMessage(sessionId, "keep marking it done");

    expect(generateWithTools).toHaveBeenCalledTimes(4);
    expect(assistantMessage.content).not.toMatch(/wasn't able to finish/i);
    const occurrences = (assistantMessage.content.match(/Updated the task \(status → DONE\)/g) ?? []).length;
    expect(occurrences).toBe(4);
  });

  it("only sends the most recent 20 messages in this session as history to Gemini", async () => {
    await loginAs(ownerId);
    for (let i = 0; i < 25; i++) {
      await db.jarvisMessage.create({ data: { sessionId, userId: ownerId, role: "USER", content: `msg ${i}` } });
    }
    vi.mocked(generateWithTools).mockResolvedValueOnce(textOnlyResponse("ok"));

    await sendJarvisMessage(sessionId, "the newest message");

    const contentsArg = vi.mocked(generateWithTools).mock.calls[0][1];
    expect(contentsArg).toHaveLength(21);
    expect(contentsArg[0]?.parts?.[0]?.text).toBe("msg 5");
    expect(contentsArg[contentsArg.length - 1]?.parts?.[0]?.text).toBe("the newest message");
  });

  it("persists a visible error message, does not throw, and stores no token counts when the Gemini call itself fails", async () => {
    await loginAs(ownerId);
    vi.mocked(generateWithTools).mockRejectedValueOnce(new Error("network blip"));

    const { assistantMessage } = await sendJarvisMessage(sessionId, "hello");

    expect(assistantMessage.content).toMatch(/something went wrong/i);
    expect(assistantMessage.totalTokens).toBeNull();
    const stored = await db.jarvisMessage.findMany({ where: { sessionId } });
    expect(stored).toHaveLength(2);
  });

  it("sums token usage across every round of the loop onto the assistant message", async () => {
    await loginAs(ownerId);
    vi.mocked(generateWithTools)
      .mockResolvedValueOnce(
        toolCallResponse([{ name: "findTasks", args: { query: "x" } }], { promptTokenCount: 40, candidatesTokenCount: 10, totalTokenCount: 50 })
      )
      .mockResolvedValueOnce(
        textOnlyResponse("Done.", { promptTokenCount: 60, candidatesTokenCount: 15, totalTokenCount: 75 })
      );

    const { assistantMessage } = await sendJarvisMessage(sessionId, "find something");

    expect(assistantMessage.promptTokens).toBe(100);
    expect(assistantMessage.completionTokens).toBe(25);
    expect(assistantMessage.totalTokens).toBe(125);
  });

  it("sets the session's title from the first message, and does not overwrite it on the second", async () => {
    await loginAs(ownerId);
    vi.mocked(generateWithTools).mockResolvedValue(textOnlyResponse("ok"));

    await sendJarvisMessage(sessionId, "Start tracking a brand new initiative called Rocket Launch Prep");
    let session = await db.jarvisSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.title).toBe("Start tracking a brand new initiative called Rocket Launch Prep");

    await sendJarvisMessage(sessionId, "a second, unrelated message");
    session = await db.jarvisSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.title).toBe("Start tracking a brand new initiative called Rocket Launch Prep");
  });

  it("truncates a long first message to a title at a word boundary", async () => {
    await loginAs(ownerId);
    vi.mocked(generateWithTools).mockResolvedValue(textOnlyResponse("ok"));

    await sendJarvisMessage(
      sessionId,
      "This is a very long message that definitely exceeds the forty eight character auto title limit by a lot"
    );

    const session = await db.jarvisSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.title?.length).toBeLessThanOrEqual(49);
    expect(session.title?.endsWith("…")).toBe(true);
    expect(session.title).not.toMatch(/\s…$/);
  });

  it("rejects sending to a session owned by someone else", async () => {
    await loginAs(viewerId);
    await expect(sendJarvisMessage(sessionId, "hi")).rejects.toThrow(PermissionError);
  });

  it("requires being logged in", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(sendJarvisMessage(sessionId, "hi")).rejects.toThrow(PermissionError);
  });
});
```

- [ ] **Step 4: Run tests and commit**

```bash
npm test -- tests/integration/jarvis.test.ts
```

Expected: PASS (17 tests).

```bash
git add app/actions/jarvis.ts tests/integration/jarvis.test.ts
git commit -m "feat: scope sendJarvisMessage to a session, add auto-title and token summation"
```

---

### Task 5: Themed scrollbar utility + `Modal` z-index fix

**Files:**
- Create: `components/ui/scrollbar.ts`
- Modify: `components/ui/Modal.tsx`

**Interfaces:**
- Produces: `THEMED_SCROLLBAR` (a Tailwind class string), consumed by Task 7's `JarvisChat.tsx` and Task 6's `JarvisSessionList.tsx`.

**Named risk:** `JarvisWorkspace` (Task 8) sits at `z-[110]`, and the resized canvas strip that Task 10 introduces sits at `z-[115]` — any dialog opened from a button inside that resized canvas (e.g. "New Thread") must render above both, or it becomes invisible. `Modal` is portalled to `document.body` (fixed in an earlier sub-project), so its own z-index is compared directly against these at the root — it just needs to be numerically higher.

- [ ] **Step 1: Add the scrollbar utility**

```ts
// components/ui/scrollbar.ts
// Tailwind v4 arbitrary-variant syntax -- no plugin needed. Firefox reads
// the two `scrollbar-*` properties; Chrome/Edge/Safari read the
// `::-webkit-scrollbar*` pseudo-elements. Colors are hardcoded to this
// app's single always-dark theme rather than composed through var()+opacity
// (Tailwind's arbitrary-property syntax can't cleanly chain the two).
export const THEMED_SCROLLBAR =
  "[scrollbar-width:thin] [scrollbar-color:rgba(234,252,255,0.2)_transparent] " +
  "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent " +
  "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(234,252,255,0.2)] " +
  "[&::-webkit-scrollbar-thumb:hover]:bg-[rgba(234,252,255,0.35)]";
```

- [ ] **Step 2: Bump `Modal`'s z-index**

In `components/ui/Modal.tsx`, change the backdrop `<div>`'s className from `"fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/55 p-4"` to:

```tsx
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/55 p-4"
```

Add a one-line comment directly above the `return createPortal(` line explaining why:

```tsx
  // z-[200]: must clear JarvisWorkspace (z-[110]) and the resized canvas
  // strip it sits alongside when open (z-[115]) -- dialogs like
  // NewThreadButton's are triggered from inside that resized canvas.
  return createPortal(
```

- [ ] **Step 3: Run the Modal test and commit**

```bash
npm test -- tests/component/Modal.test.tsx
```

Expected: PASS (3 tests) — unaffected by the z-index number itself.

```bash
git add components/ui/scrollbar.ts components/ui/Modal.tsx
git commit -m "feat: add themed scrollbar utility; raise Modal above the Jarvis workspace"
```

---

### Task 6: `JarvisSessionList.tsx` — session sidebar

**Files:**
- Create: `components/jarvis/JarvisSessionList.tsx`
- Create: `tests/component/JarvisSessionList.test.tsx`

**Interfaces:**
- Consumes: Task 5's `THEMED_SCROLLBAR`; `components/ui/Button.tsx`, `components/ui/Input.tsx` (existing).
- Produces: `JarvisSessionSummary` type (also consumed by Task 8's `JarvisWorkspace.tsx` and Task 10's `Canvas.tsx`).

- [ ] **Step 1: Write the component**

```tsx
// components/jarvis/JarvisSessionList.tsx
"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { THEMED_SCROLLBAR } from "@/components/ui/scrollbar";

export type JarvisSessionSummary = { id: string; title: string | null; updatedAt: Date };

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export default function JarvisSessionList({
  sessions,
  activeSessionId,
  onNewChat,
  onSelect,
  onRename,
  onDelete,
}: {
  sessions: JarvisSessionSummary[];
  activeSessionId: string | null;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  function commitRename(id: string) {
    onRename(id, draftTitle);
    setEditingId(null);
  }

  return (
    <div className="flex h-full w-64 shrink-0 flex-col gap-2 border-r border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] p-3">
      <Button onClick={onNewChat} className="w-full justify-start gap-2">
        <Plus size={16} />
        New chat
      </Button>
      <ul aria-label="Chat sessions" className={`flex flex-1 flex-col gap-1 overflow-y-auto ${THEMED_SCROLLBAR}`}>
        {sessions.map((s) => (
          <li key={s.id}>
            {editingId === s.id ? (
              <div className="p-1">
                <Input
                  label="Session title"
                  hideLabel
                  autoFocus
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onBlur={() => commitRename(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(s.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(s.id)}
                onKeyDown={(e) => e.key === "Enter" && onSelect(s.id)}
                className={`group flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${
                  s.id === activeSessionId
                    ? "bg-[var(--accent,#38e0ff)]/10 text-[var(--text,#eafcff)]"
                    : "text-[var(--text,#eafcff)]/80 hover:bg-[var(--text,#eafcff)]/5"
                }`}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{s.title ?? "New chat"}</span>
                  <span className="text-xs text-[var(--text,#eafcff)]/50">{formatRelativeTime(s.updatedAt)}</span>
                </div>
                <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
                  <button
                    aria-label="Rename session"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDraftTitle(s.title ?? "");
                      setEditingId(s.id);
                    }}
                    className="rounded p-1 hover:bg-[var(--text,#eafcff)]/10"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    aria-label="Delete session"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(s.id);
                    }}
                    className="rounded p-1 hover:bg-[var(--text,#eafcff)]/10"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Write component tests**

```tsx
// tests/component/JarvisSessionList.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import JarvisSessionList from "@/components/jarvis/JarvisSessionList";

const SESSIONS = [
  { id: "s1", title: "Rocket Launch Prep", updatedAt: new Date() },
  { id: "s2", title: null, updatedAt: new Date() },
];

describe("JarvisSessionList", () => {
  it("renders sessions, using \"New chat\" as the placeholder for a null title", () => {
    render(
      <JarvisSessionList
        sessions={SESSIONS}
        activeSessionId={null}
        onNewChat={vi.fn()}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText("Rocket Launch Prep")).toBeInTheDocument();
    expect(screen.getAllByText("New chat")).toHaveLength(2); // the button + the untitled session
  });

  it("calls onNewChat when the New chat button is clicked", () => {
    const onNewChat = vi.fn();
    render(
      <JarvisSessionList
        sessions={SESSIONS}
        activeSessionId={null}
        onNewChat={onNewChat}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it("calls onSelect when a session is clicked", () => {
    const onSelect = vi.fn();
    render(
      <JarvisSessionList
        sessions={SESSIONS}
        activeSessionId={null}
        onNewChat={vi.fn()}
        onSelect={onSelect}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Rocket Launch Prep"));
    expect(onSelect).toHaveBeenCalledWith("s1");
  });

  it("calls onDelete without opening a rename field, when the delete icon is clicked", () => {
    const onDelete = vi.fn();
    const onSelect = vi.fn();
    render(
      <JarvisSessionList
        sessions={SESSIONS}
        activeSessionId={null}
        onNewChat={vi.fn()}
        onSelect={onSelect}
        onRename={vi.fn()}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Delete session" })[0]);
    expect(onDelete).toHaveBeenCalledWith("s1");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renames a session on Enter after clicking the rename icon", () => {
    const onRename = vi.fn();
    render(
      <JarvisSessionList
        sessions={SESSIONS}
        activeSessionId={null}
        onNewChat={vi.fn()}
        onSelect={vi.fn()}
        onRename={onRename}
        onDelete={vi.fn()}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Rename session" })[0]);
    const input = screen.getByLabelText("Session title");
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRename).toHaveBeenCalledWith("s1", "Renamed");
  });
});
```

- [ ] **Step 3: Run tests and commit**

```bash
npm test -- tests/component/JarvisSessionList.test.tsx
```

Expected: PASS (5 tests).

```bash
git add components/jarvis/JarvisSessionList.tsx tests/component/JarvisSessionList.test.tsx
git commit -m "feat: add JarvisSessionList sidebar component"
```

---

### Task 7: `JarvisChat.tsx` — center chat pane

**Files:**
- Create: `components/jarvis/JarvisChat.tsx`
- Create: `tests/component/JarvisChat.test.tsx`

**Interfaces:**
- Consumes: Task 5's `THEMED_SCROLLBAR`; `components/ui/Textarea.tsx`, `components/ui/Button.tsx`, `components/ui/FormAlert.tsx` (existing).
- Produces: `JarvisMessageView` type (also consumed by Task 8's `JarvisWorkspace.tsx`).

**Named risk:** the "Jarvis is thinking…" loading bubble must be found by `data-testid`, not text — matching this codebase's established fix for exactly this class of fragility (see `Canvas.test.tsx`'s `card-menu-trigger-area` testid from an earlier sub-project).

- [ ] **Step 1: Write the component**

```tsx
// components/jarvis/JarvisChat.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import FormAlert from "@/components/ui/FormAlert";
import { THEMED_SCROLLBAR } from "@/components/ui/scrollbar";

export type JarvisMessageView = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  toolCalls: { tool: string; success: boolean; summary: string }[] | null;
  totalTokens: number | null;
};

export default function JarvisChat({
  sessionTitle,
  messages,
  sending,
  error,
  onSend,
  onRenameSession,
  onClose,
}: {
  sessionTitle: string | null;
  messages: JarvisMessageView[];
  sending: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onRenameSession: (title: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(sessionTitle ?? "");
  const listEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, sending]);

  const totalTokens = messages.reduce((sum, m) => sum + (m.totalTokens ?? 0), 0);

  function commitTitle() {
    onRenameSession(titleDraft);
    setEditingTitle(false);
  }

  function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    onSend(text);
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--text,#eafcff)]/10 px-5 py-3">
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") setEditingTitle(false);
            }}
            aria-label="Session title"
            className="min-w-0 flex-1 rounded border border-[var(--accent,#38e0ff)]/40 bg-transparent px-2 py-1 text-lg font-semibold text-[var(--text,#eafcff)] outline-none"
          />
        ) : (
          <h2
            role="button"
            tabIndex={0}
            onClick={() => {
              setTitleDraft(sessionTitle ?? "");
              setEditingTitle(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setTitleDraft(sessionTitle ?? "");
                setEditingTitle(true);
              }
            }}
            className="min-w-0 flex-1 cursor-text truncate text-lg font-semibold text-[var(--text,#eafcff)]"
          >
            {sessionTitle ?? "New chat"}
          </h2>
        )}
        <div className="flex shrink-0 items-center gap-3">
          {totalTokens > 0 && (
            <span className="text-xs text-[var(--text,#eafcff)]/50">{totalTokens.toLocaleString()} tokens</span>
          )}
          <button
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text,#eafcff)]/70 hover:bg-[var(--text,#eafcff)]/10 hover:text-[var(--text,#eafcff)]"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto p-5 ${THEMED_SCROLLBAR}`}>
        <div className="flex flex-col gap-3">
          {messages.map((m) => (
            <div
              key={m.id}
              data-testid="jarvis-message"
              className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm ${
                m.role === "USER"
                  ? "self-end bg-[var(--accent,#38e0ff)]/20 text-[var(--text,#eafcff)]"
                  : "self-start bg-[var(--text,#eafcff)]/10 text-[var(--text,#eafcff)]"
              }`}
            >
              <strong>{m.role === "USER" ? "You" : "Jarvis"}:</strong> {m.content}
              {m.toolCalls?.map((c, i) => (
                <div key={i} className="mt-1 text-xs text-[var(--text,#eafcff)]/70">
                  {c.success ? "✓" : "✗"} {c.summary}
                </div>
              ))}
              {m.role === "ASSISTANT" && m.totalTokens != null && (
                <div className="mt-1 text-xs text-[var(--text,#eafcff)]/40">{m.totalTokens} tokens</div>
              )}
            </div>
          ))}
          {sending && (
            <div
              data-testid="jarvis-loading"
              className="flex w-fit items-center gap-1 self-start rounded-xl bg-[var(--text,#eafcff)]/10 px-4 py-3"
            >
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text,#eafcff)]/60 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text,#eafcff)]/60 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text,#eafcff)]/60" />
            </div>
          )}
          <div ref={listEndRef} />
        </div>
      </div>

      {error && (
        <div className="px-5 pb-2">
          <FormAlert>{error}</FormAlert>
        </div>
      )}

      <div className="flex items-end gap-2 border-t border-[var(--text,#eafcff)]/10 p-4">
        <Textarea
          label="Message Jarvis"
          hideLabel
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={sending}
          rows={1}
          className="min-h-[44px] flex-1 resize-none"
        />
        <Button onClick={handleSend} disabled={sending} className="shrink-0">
          Send
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write component tests**

```tsx
// tests/component/JarvisChat.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import JarvisChat from "@/components/jarvis/JarvisChat";

const MESSAGES = [
  { id: "1", role: "USER" as const, content: "hi", toolCalls: null, totalTokens: null },
  { id: "2", role: "ASSISTANT" as const, content: "hello!", toolCalls: null, totalTokens: 42 },
];

describe("JarvisChat", () => {
  it("renders messages and the session title", () => {
    render(
      <JarvisChat
        sessionTitle="Rocket Launch Prep"
        messages={MESSAGES}
        sending={false}
        error={null}
        onSend={vi.fn()}
        onRenameSession={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Rocket Launch Prep")).toBeInTheDocument();
    const rendered = screen.getAllByTestId("jarvis-message");
    expect(rendered.map((m) => m.textContent)).toEqual([
      expect.stringContaining("hi"),
      expect.stringContaining("hello!"),
    ]);
  });

  it("falls back to \"New chat\" when the title is null", () => {
    render(
      <JarvisChat
        sessionTitle={null}
        messages={[]}
        sending={false}
        error={null}
        onSend={vi.fn()}
        onRenameSession={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("New chat")).toBeInTheDocument();
  });

  it("shows the running token total, summed across assistant messages only", () => {
    render(
      <JarvisChat
        sessionTitle="x"
        messages={MESSAGES}
        sending={false}
        error={null}
        onSend={vi.fn()}
        onRenameSession={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("42 tokens")).toBeInTheDocument();
  });

  it("shows a loading indicator while sending, and hides it once not sending", () => {
    const { rerender } = render(
      <JarvisChat
        sessionTitle="x"
        messages={MESSAGES}
        sending={true}
        error={null}
        onSend={vi.fn()}
        onRenameSession={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByTestId("jarvis-loading")).toBeInTheDocument();

    rerender(
      <JarvisChat
        sessionTitle="x"
        messages={MESSAGES}
        sending={false}
        error={null}
        onSend={vi.fn()}
        onRenameSession={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByTestId("jarvis-loading")).not.toBeInTheDocument();
  });

  it("sends a trimmed message and clears the draft", () => {
    const onSend = vi.fn();
    render(
      <JarvisChat
        sessionTitle="x"
        messages={[]}
        sending={false}
        error={null}
        onSend={onSend}
        onRenameSession={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Message Jarvis"), { target: { value: "  call the vendor  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).toHaveBeenCalledWith("call the vendor");
    expect(screen.getByLabelText("Message Jarvis")).toHaveValue("");
  });

  it("does not send an empty message", () => {
    const onSend = vi.fn();
    render(
      <JarvisChat
        sessionTitle="x"
        messages={[]}
        sending={false}
        error={null}
        onSend={onSend}
        onRenameSession={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("shows the error alert when error is set", () => {
    render(
      <JarvisChat
        sessionTitle="x"
        messages={[]}
        sending={false}
        error="Couldn't reach Jarvis — please try again."
        onSend={vi.fn()}
        onRenameSession={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't reach Jarvis");
  });

  it("renames the session on Enter after clicking the title", () => {
    const onRenameSession = vi.fn();
    render(
      <JarvisChat
        sessionTitle="Old title"
        messages={[]}
        sending={false}
        error={null}
        onSend={vi.fn()}
        onRenameSession={onRenameSession}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Old title" }));
    const input = screen.getByLabelText("Session title");
    fireEvent.change(input, { target: { value: "New title" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRenameSession).toHaveBeenCalledWith("New title");
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <JarvisChat
        sessionTitle="x"
        messages={[]}
        sending={false}
        error={null}
        onSend={vi.fn()}
        onRenameSession={vi.fn()}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run tests and commit**

```bash
npm test -- tests/component/JarvisChat.test.tsx
```

Expected: PASS (9 tests).

```bash
git add components/jarvis/JarvisChat.tsx tests/component/JarvisChat.test.tsx
git commit -m "feat: add JarvisChat center pane with loading indicator and token display"
```

---

### Task 8: `JarvisWorkspace.tsx` — the full-screen shell

**Files:**
- Create: `components/jarvis/JarvisWorkspace.tsx`
- Create: `tests/component/JarvisWorkspace.test.tsx`

**Interfaces:**
- Consumes: Task 6's `JarvisSessionList` + `JarvisSessionSummary`; Task 7's `JarvisChat` + `JarvisMessageView`; Task 3's `createJarvisSession`/`listJarvisSessions`/`renameJarvisSession`/`deleteJarvisSession`/`listJarvisMessages`; Task 4's `sendJarvisMessage`.
- Produces: `JarvisWorkspace` — consumed by Task 10's `Canvas.tsx`.

**Named risk:** `sendJarvisMessage`'s own internal `catch` already turns a Gemini failure into a normal, persisted fallback-text assistant message (Task 4) — `handleSend`'s `catch` here only fires for something else going wrong entirely (e.g. a permission/network failure calling the Server Action itself). Don't conflate the two error paths.

- [ ] **Step 1: Write the component**

```tsx
// components/jarvis/JarvisWorkspace.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import JarvisSessionList, { type JarvisSessionSummary } from "./JarvisSessionList";
import JarvisChat, { type JarvisMessageView } from "./JarvisChat";
import {
  createJarvisSession,
  listJarvisSessions,
  renameJarvisSession,
  deleteJarvisSession,
  listJarvisMessages,
} from "@/app/actions/jarvisSessions";
import { sendJarvisMessage } from "@/app/actions/jarvis";

function toMessageView(raw: {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  toolCalls: unknown;
  totalTokens: number | null;
}): JarvisMessageView {
  return {
    id: raw.id,
    role: raw.role,
    content: raw.content,
    toolCalls: raw.toolCalls as { tool: string; success: boolean; summary: string }[] | null,
    totalTokens: raw.totalTokens,
  };
}

export default function JarvisWorkspace({
  initialSessions,
  onClose,
}: {
  initialSessions: JarvisSessionSummary[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<JarvisSessionSummary[]>(initialSessions);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(initialSessions[0]?.id ?? null);
  const [messages, setMessages] = useState<JarvisMessageView[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSessions = useCallback(async () => {
    setSessions(await listJarvisSessions());
  }, []);

  const loadSession = useCallback(async (sessionId: string | null) => {
    setActiveSessionId(sessionId);
    setError(null);
    if (sessionId === null) {
      setMessages([]);
      return;
    }
    const raw = await listJarvisMessages(sessionId);
    setMessages(raw.map(toMessageView));
  }, []);

  // Loads the initially-active session's messages once on mount. Session
  // switches afterward go through handleSelect, not this effect.
  useEffect(() => {
    if (activeSessionId) void loadSession(activeSessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleNewChat() {
    const created = await createJarvisSession();
    await refreshSessions();
    await loadSession(created.id);
  }

  async function handleSelect(sessionId: string) {
    if (sessionId === activeSessionId) return;
    await loadSession(sessionId);
  }

  async function handleRename(sessionId: string, title: string) {
    await renameJarvisSession(sessionId, title);
    await refreshSessions();
  }

  async function handleDelete(sessionId: string) {
    await deleteJarvisSession(sessionId);
    const remaining = sessions.filter((s) => s.id !== sessionId);
    await refreshSessions();
    if (activeSessionId === sessionId) {
      await loadSession(remaining[0]?.id ?? null);
    }
  }

  async function handleRenameActiveSession(title: string) {
    if (!activeSessionId) return;
    await handleRename(activeSessionId, title);
  }

  async function handleSend(text: string) {
    let sessionId = activeSessionId;
    if (!sessionId) {
      const created = await createJarvisSession();
      sessionId = created.id;
      setActiveSessionId(sessionId);
      await refreshSessions();
    }
    setError(null);
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: `pending-user-${Date.now()}`, role: "USER", content: text, toolCalls: null, totalTokens: null },
    ]);
    try {
      await sendJarvisMessage(sessionId, text);
      const raw = await listJarvisMessages(sessionId);
      setMessages(raw.map(toMessageView));
      await refreshSessions();
      // Tool calls (creating/updating threads and tasks) don't otherwise
      // reach the canvas's server-rendered props -- this is what makes the
      // right-side canvas preview actually live.
      router.refresh();
    } catch {
      setError("Couldn't reach Jarvis — please try again.");
      setMessages((prev) => prev.filter((m) => !m.id.startsWith("pending-user-")));
    } finally {
      setSending(false);
    }
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  return (
    <div className="fixed inset-0 z-[110] flex bg-[var(--bg,#0a0e14)]">
      <JarvisSessionList
        sessions={sessions}
        activeSessionId={activeSessionId}
        onNewChat={handleNewChat}
        onSelect={handleSelect}
        onRename={handleRename}
        onDelete={handleDelete}
      />
      <JarvisChat
        sessionTitle={activeSession?.title ?? null}
        messages={messages}
        sending={sending}
        error={error}
        onSend={handleSend}
        onRenameSession={handleRenameActiveSession}
        onClose={onClose}
      />
    </div>
  );
}
```

- [ ] **Step 2: Write component tests**

```tsx
// tests/component/JarvisWorkspace.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import JarvisWorkspace from "@/components/jarvis/JarvisWorkspace";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

vi.mock("@/app/actions/jarvisSessions", () => ({
  createJarvisSession: vi.fn(),
  listJarvisSessions: vi.fn(),
  renameJarvisSession: vi.fn(),
  deleteJarvisSession: vi.fn(),
  listJarvisMessages: vi.fn(),
}));
import {
  createJarvisSession,
  listJarvisSessions,
  renameJarvisSession,
  deleteJarvisSession,
  listJarvisMessages,
} from "@/app/actions/jarvisSessions";

vi.mock("@/app/actions/jarvis", () => ({ sendJarvisMessage: vi.fn() }));
import { sendJarvisMessage } from "@/app/actions/jarvis";

const SESSIONS = [{ id: "s1", title: "Rocket Launch Prep", updatedAt: new Date() }];

describe("JarvisWorkspace", () => {
  beforeEach(() => {
    vi.mocked(listJarvisMessages).mockResolvedValue([]);
    vi.mocked(listJarvisSessions).mockResolvedValue(SESSIONS as never);
    refresh.mockReset();
  });

  it("loads and shows the first session's messages on mount", async () => {
    vi.mocked(listJarvisMessages).mockResolvedValue([
      { id: "m1", role: "USER", content: "hi", toolCalls: null, totalTokens: null },
    ] as never);

    render(<JarvisWorkspace initialSessions={SESSIONS} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("jarvis-message")).toHaveTextContent("hi"));
    expect(listJarvisMessages).toHaveBeenCalledWith("s1");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<JarvisWorkspace initialSessions={SESSIONS} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes via the close button", () => {
    const onClose = vi.fn();
    render(<JarvisWorkspace initialSessions={SESSIONS} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("switching sessions loads that session's messages", async () => {
    vi.mocked(listJarvisSessions).mockResolvedValue([
      { id: "s1", title: "First", updatedAt: new Date() },
      { id: "s2", title: "Second", updatedAt: new Date() },
    ] as never);
    render(
      <JarvisWorkspace
        initialSessions={[
          { id: "s1", title: "First", updatedAt: new Date() },
          { id: "s2", title: "Second", updatedAt: new Date() },
        ]}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(listJarvisMessages).toHaveBeenCalledWith("s1"));

    vi.mocked(listJarvisMessages).mockResolvedValue([
      { id: "m2", role: "USER", content: "second session message", toolCalls: null, totalTokens: null },
    ] as never);
    fireEvent.click(screen.getByText("Second"));

    await waitFor(() => expect(listJarvisMessages).toHaveBeenCalledWith("s2"));
    await waitFor(() => expect(screen.getByTestId("jarvis-message")).toHaveTextContent("second session message"));
  });

  it("creates a new session and switches to it", async () => {
    vi.mocked(createJarvisSession).mockResolvedValue({ id: "new-session", title: null } as never);
    render(<JarvisWorkspace initialSessions={SESSIONS} onClose={vi.fn()} />);
    await waitFor(() => expect(listJarvisMessages).toHaveBeenCalledWith("s1"));

    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));

    await waitFor(() => expect(createJarvisSession).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(listJarvisMessages).toHaveBeenCalledWith("new-session"));
  });

  it("sends a message: shows it optimistically, then replaces with the server's messages and refreshes the router", async () => {
    vi.mocked(sendJarvisMessage).mockResolvedValue({
      userMessage: { id: "u1" } as never,
      assistantMessage: { id: "a1" } as never,
    });
    render(<JarvisWorkspace initialSessions={SESSIONS} onClose={vi.fn()} />);
    await waitFor(() => expect(listJarvisMessages).toHaveBeenCalledWith("s1"));

    vi.mocked(listJarvisMessages).mockResolvedValue([
      { id: "u1", role: "USER", content: "call the vendor", toolCalls: null, totalTokens: null },
      { id: "a1", role: "ASSISTANT", content: "Done.", toolCalls: null, totalTokens: 12 },
    ] as never);

    fireEvent.change(screen.getByLabelText("Message Jarvis"), { target: { value: "call the vendor" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByTestId("jarvis-loading")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Done.")).toBeInTheDocument());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows an error and removes the optimistic message when sendJarvisMessage rejects", async () => {
    vi.mocked(sendJarvisMessage).mockRejectedValue(new Error("network down"));
    render(<JarvisWorkspace initialSessions={SESSIONS} onClose={vi.fn()} />);
    await waitFor(() => expect(listJarvisMessages).toHaveBeenCalledWith("s1"));

    fireEvent.change(screen.getByLabelText("Message Jarvis"), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/couldn't reach jarvis/i));
    expect(screen.queryByText("hi")).not.toBeInTheDocument();
  });

  it("deletes a session and falls back to another remaining one", async () => {
    vi.mocked(listJarvisSessions)
      .mockResolvedValueOnce([
        { id: "s1", title: "First", updatedAt: new Date() },
        { id: "s2", title: "Second", updatedAt: new Date() },
      ] as never)
      .mockResolvedValue([{ id: "s2", title: "Second", updatedAt: new Date() }] as never);
    render(
      <JarvisWorkspace
        initialSessions={[
          { id: "s1", title: "First", updatedAt: new Date() },
          { id: "s2", title: "Second", updatedAt: new Date() },
        ]}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(listJarvisMessages).toHaveBeenCalledWith("s1"));

    fireEvent.click(screen.getAllByRole("button", { name: "Delete session" })[0]);

    await waitFor(() => expect(deleteJarvisSession).toHaveBeenCalledWith("s1"));
    await waitFor(() => expect(listJarvisMessages).toHaveBeenCalledWith("s2"));
  });
});
```

- [ ] **Step 3: Run tests and commit**

```bash
npm test -- tests/component/JarvisWorkspace.test.tsx
```

Expected: PASS (8 tests).

```bash
git add components/jarvis/JarvisWorkspace.tsx tests/component/JarvisWorkspace.test.tsx
git commit -m "feat: add JarvisWorkspace shell wiring sessions, chat, and Escape/close"
```

---

### Task 9: Shrink `JarvisPanel.tsx` to just the trigger button

**Files:**
- Modify: `components/jarvis/JarvisPanel.tsx`
- Modify: `tests/component/JarvisPanel.test.tsx`

**Interfaces:**
- Produces: `JarvisPanel({ onOpen: () => void })` — consumed by Task 10's `Canvas.tsx`.

- [ ] **Step 1: Replace the component**

```tsx
// components/jarvis/JarvisPanel.tsx
"use client";

import { Sparkles } from "lucide-react";

export default function JarvisPanel({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      aria-label="Jarvis"
      onClick={onOpen}
      className="fixed bottom-4 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent,#38e0ff)] text-[#04121a] shadow-2xl transition-transform hover:scale-105"
    >
      <Sparkles size={22} />
    </button>
  );
}
```

- [ ] **Step 2: Replace the test file**

```tsx
// tests/component/JarvisPanel.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import JarvisPanel from "@/components/jarvis/JarvisPanel";

describe("JarvisPanel", () => {
  it("renders a trigger button and calls onOpen when clicked", () => {
    const onOpen = vi.fn();
    render(<JarvisPanel onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("button", { name: "Jarvis" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run tests and commit**

```bash
npm test -- tests/component/JarvisPanel.test.tsx
```

Expected: PASS (1 test).

```bash
git add components/jarvis/JarvisPanel.tsx tests/component/JarvisPanel.test.tsx
git commit -m "feat: shrink JarvisPanel to just the floating trigger button"
```

---

### Task 10: Wire it into `Canvas.tsx`

**Files:**
- Modify: `components/canvas/Canvas.tsx`

**Interfaces:**
- Consumes: Task 6's `JarvisSessionSummary`; Task 8's `JarvisWorkspace`; Task 9's `JarvisPanel`.
- Produces: `Canvas`'s prop changes from `initialJarvisMessages: {...}[]` to `initialJarvisSessions: JarvisSessionSummary[]` — Task 11 updates the one caller.

**Named risk:** the toolbar (`NewThreadButton`/`NewTaskButton`/`ShareThreadDialog`) and `<ReactFlow>` must be resized **together** as one unit when the workspace opens — resizing only the `<ReactFlow>` div would leave the toolbar behind at the original top-left of the full viewport, disconnected from the now-narrow canvas strip.

- [ ] **Step 1: Update imports and props**

In `components/canvas/Canvas.tsx`, replace:

```tsx
import JarvisPanel from "@/components/jarvis/JarvisPanel";
```

with:

```tsx
import JarvisPanel from "@/components/jarvis/JarvisPanel";
import JarvisWorkspace from "@/components/jarvis/JarvisWorkspace";
import type { JarvisSessionSummary } from "@/components/jarvis/JarvisSessionList";
```

Replace both occurrences of the `initialJarvisMessages` prop type (one in `CanvasInner`'s props, one in the default-exported `Canvas`'s props) — i.e. replace this shape, which appears twice in the file:

```tsx
  initialJarvisMessages: {
    id: string;
    role: "USER" | "ASSISTANT";
    content: string;
    toolCalls: { tool: string; success: boolean; summary: string }[] | null;
  }[];
```

with, in both places:

```tsx
  initialJarvisSessions: JarvisSessionSummary[];
```

And update the `CanvasInner({ ... })` destructuring line from `initialJarvisMessages,` to `initialJarvisSessions,`, and the final `<CanvasInner {...props} />` call is unaffected (it already spreads all props).

- [ ] **Step 2: Add workspace-open state**

Inside `CanvasInner`, alongside the existing `const [tier, setTier] = useState...` line, add:

```tsx
  const [jarvisWorkspaceOpen, setJarvisWorkspaceOpen] = useState(false);
```

- [ ] **Step 3: Wrap the toolbar + ReactFlow in a resizable region**

Replace this block (the toolbar `<div>` immediately followed by `<ReactFlow>...</ReactFlow>`):

```tsx
      <div style={{ position: "absolute", top: 8, left: 8, zIndex: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <NewThreadButton onCreate={handleCreateThread} />
        {threads.map((thread) => (
          <div key={thread.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span>{thread.name}</span>
            <NewTaskButton
              threadId={thread.id}
              onCreate={(input) => handleCreateTask(thread.id, input)}
            />
            {/* Sharing (invite/list/revoke) is OWNER-only server-side
                (lib/permissions.ts canManageShares) — the whole dialog is
                hidden for an EDITOR/VIEWER rather than shown and rejected. */}
            {thread.role === "OWNER" && (
              <ShareThreadDialog
                threadId={thread.id}
                onShare={(email, permission) => handleShareThread(thread.id, email, permission)}
                onOpen={() => handleLoadThreadShares(thread.id)}
                shares={threadShares[thread.id] ?? []}
                onRevoke={(shareId) => handleRevokeThreadShare(thread.id, shareId)}
              />
            )}
          </div>
        ))}
      </div>

      <ReactFlow
        nodes={nodes}
        nodeTypes={nodeTypes}
        onMoveEnd={handleMoveEnd}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={handleNodeClick}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
```

with:

```tsx
      {/* Toolbar and ReactFlow are resized together as one unit -- when the
          Jarvis workspace is open, this whole region shrinks into a
          right-pinned strip via `fixed` positioning (which also makes it a
          containing block for the toolbar's `position: absolute` below, so
          "top:8 left:8" anchors to this strip, not the full viewport) rather
          than the ReactFlow canvas alone, so the toolbar stays visually
          attached to it instead of floating disconnected at the old
          top-left. The SAME <ReactFlow> element is reused either way (no
          remount), so pan/zoom state survives opening and closing Jarvis. */}
      <div
        className={
          jarvisWorkspaceOpen
            ? "fixed inset-y-0 right-0 z-[115] w-[38%] min-w-[360px] border-l border-[var(--text,#eafcff)]/10"
            : "absolute inset-0"
        }
      >
        <div style={{ position: "absolute", top: 8, left: 8, zIndex: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <NewThreadButton onCreate={handleCreateThread} />
          {threads.map((thread) => (
            <div key={thread.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span>{thread.name}</span>
              <NewTaskButton
                threadId={thread.id}
                onCreate={(input) => handleCreateTask(thread.id, input)}
              />
              {/* Sharing (invite/list/revoke) is OWNER-only server-side
                  (lib/permissions.ts canManageShares) — the whole dialog is
                  hidden for an EDITOR/VIEWER rather than shown and rejected. */}
              {thread.role === "OWNER" && (
                <ShareThreadDialog
                  threadId={thread.id}
                  onShare={(email, permission) => handleShareThread(thread.id, email, permission)}
                  onOpen={() => handleLoadThreadShares(thread.id)}
                  shares={threadShares[thread.id] ?? []}
                  onRevoke={(shareId) => handleRevokeThreadShare(thread.id, shareId)}
                />
              )}
            </div>
          ))}
        </div>

        <ReactFlow
          nodes={nodes}
          nodeTypes={nodeTypes}
          onMoveEnd={handleMoveEnd}
          onNodeDragStop={handleNodeDragStop}
          onNodeClick={handleNodeClick}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
```

- [ ] **Step 4: Replace the `JarvisPanel` render**

Replace the last line before `CanvasInner`'s closing `</div>`:

```tsx
      <JarvisPanel initialMessages={initialJarvisMessages} />
```

with:

```tsx
      {!jarvisWorkspaceOpen && <JarvisPanel onOpen={() => setJarvisWorkspaceOpen(true)} />}
      {jarvisWorkspaceOpen && (
        <JarvisWorkspace initialSessions={initialJarvisSessions} onClose={() => setJarvisWorkspaceOpen(false)} />
      )}
```

- [ ] **Step 5: Run the existing Canvas tests**

```bash
npm test -- tests/component/Canvas.test.tsx
```

Expected: PASS (this file doesn't touch Jarvis directly, per the earlier sub-project's investigation — it should be unaffected by this change; if anything fails, read the failure before assuming it's pre-existing).

- [ ] **Step 6: Commit**

```bash
git add components/canvas/Canvas.tsx
git commit -m "feat: wire JarvisWorkspace into Canvas, resizing the canvas alongside it"
```

---

### Task 11: Update `app/(app)/canvas/page.tsx`

**Files:**
- Modify: `app/(app)/canvas/page.tsx`

**Interfaces:**
- Consumes: Task 10's `Canvas`'s new `initialJarvisSessions` prop.

- [ ] **Step 1: Replace the Jarvis data fetch**

Replace:

```tsx
  const jarvisMessages = (
    await db.jarvisMessage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
  ).reverse();
```

with:

```tsx
  const jarvisSessions = await db.jarvisSession.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
  });
```

- [ ] **Step 2: Update the `<Canvas>` call**

Replace:

```tsx
      initialJarvisMessages={jarvisMessages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls as { tool: string; success: boolean; summary: string }[] | null,
      }))}
```

with:

```tsx
      initialJarvisSessions={jarvisSessions}
```

- [ ] **Step 3: Verify the build and commit**

```bash
npm run build
```

Expected: compiles cleanly (this is a Server Component change — TypeScript would catch a prop-shape mismatch here, which `npm test` alone would not since no test file renders this page directly).

```bash
git add "app/(app)/canvas/page.tsx"
git commit -m "feat: fetch Jarvis sessions instead of a flat message list on the canvas page"
```

---

### Task 12: Rewrite `tests/e2e/jarvis-flow.spec.ts`

**Files:**
- Modify: `tests/e2e/jarvis-flow.spec.ts`

**Interfaces:**
- Consumes: the real app end-to-end (real Gemini API call) — no mocking.

**Named risk:** the original file's `page.reload()` workaround existed because `sendJarvisMessage` never refreshed the canvas's server-rendered props. Task 8's `JarvisWorkspace.handleSend` now calls `router.refresh()` after a successful send — the reload is no longer needed, and keeping it would just be redundant, not wrong. This rewrite drops it.

- [ ] **Step 1: Replace the file**

```ts
import { test, expect } from "@playwright/test";

// End-to-end test for Jarvis: a chat message that clearly names a new,
// never-before-seen project should result in Jarvis creating a new thread
// and a task inside it via the real Gemini API (using the signed-up test
// user's default preferredAiModel, gemini-3.8-flash).
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

  await test.step("open the Jarvis workspace and send a message describing brand-new work", async () => {
    await page.getByRole("button", { name: "Jarvis" }).click();
    await page.getByLabel("Message Jarvis").fill(
      "Start tracking a brand new initiative called Rocket Launch Prep — first thing to do is book the venue."
    );
    await page.getByRole("button", { name: "Send" }).click();
  });

  await test.step("Jarvis's reply appears, and the new thread/task show up live on the canvas preview", async () => {
    // .last(): messages append user-then-assistant (see JarvisWorkspace's
    // handleSend), so this is the reply, not the just-sent user message.
    await expect(page.getByTestId("jarvis-message").last()).toBeVisible({ timeout: 30000 });
    // .first(): the model reliably names the tool-call target in both its
    // reply text and the chip -- a second success chip (if Jarvis makes more
    // than one tool call) would otherwise be a Playwright strict-mode
    // violation on a bare getByText(/✓/).
    await expect(page.getByText(/✓/).first()).toBeVisible({ timeout: 30000 });
    // No page.reload() needed: JarvisWorkspace's handleSend calls
    // router.refresh() after a successful send specifically so the canvas
    // preview reflects tool-call results live.
    await expect(page.getByText("Rocket Launch Prep").first()).toBeVisible({ timeout: 10000 });
  });

  await test.step("closing the workspace returns to the full canvas", async () => {
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("button", { name: "Jarvis" })).toBeVisible();
  });
});
```

- [ ] **Step 2: Commit**

(This task's e2e run happens as part of Task 13's full regression pass, not standalone here — a single real-API e2e spec run is expensive and this plan already budgets one full pass at the end.)

```bash
git add tests/e2e/jarvis-flow.spec.ts
git commit -m "test: rewrite jarvis-flow e2e for the new workspace UI"
```

---

### Task 13: Final regression

**Files:** none (verification only).

This task is executed directly, not dispatched to a subagent — it's verification, not implementation.

- [ ] **Step 1: Full component/integration suite**

```bash
npm test
```

Expected: all files passing (baseline was 64 files / 269 tests before this plan; this plan adds `jarvisSessions.test.ts`, `JarvisSessionList.test.tsx`, `JarvisChat.test.tsx`, `JarvisWorkspace.test.tsx`, and extends `jarvis.test.ts`/`gemini.test.ts`/`schema-jarvis.test.ts` — expect roughly 64+4 = 68 files).

- [ ] **Step 2: Production build**

```bash
npm run build
```

Expected: clean (only the pre-existing, out-of-scope "middleware deprecated" warning).

- [ ] **Step 3: Full e2e suite, against a server this worktree actually started**

Before running, confirm nothing is already listening on port 3089 from an unrelated source — an earlier sub-project this session discovered that `preview_start`'s tracked dev server can launch with the **main checkout's** cwd regardless of which worktree the calling session is in, silently testing the wrong branch's code. Verify via:

```bash
netstat -ano | grep ":3089" | grep LISTENING
```

If something is already listening, do not reuse it blindly — confirm (e.g. `curl -s http://localhost:3089/api/auth/session`, or check which process/cwd owns that port) that it is actually serving *this* worktree before trusting any e2e result against it. If in doubt, stop it and let `npm run test:e2e` spawn its own server from this worktree's `cwd`.

```bash
npm run test:e2e -- --workers=1
```

Expected: `foundation-flow`, `catchup-flow`, `forgot-password-flow` pass; `ai-prioritization-flow` and `jarvis-flow` may still be flaky against the live Gemini free-tier API (a documented, pre-existing, non-blocking pattern — see project memory) — if `jarvis-flow` fails, re-run it alone once before concluding anything, and check the failure is genuinely Gemini-side (a 429/503 in server logs) rather than a real assertion mismatch in the rewritten spec.

- [ ] **Step 4: Manual sanity check of the new layout**

Start the dev server from this worktree specifically (not via a tracked preview tool, per the lesson above) and click through: open Jarvis, confirm it takes the full viewport with sessions on the left and canvas visible on the right at the correct proportions, send a message, confirm the loading dots appear and disappear, confirm a token count appears on the reply and in the header, create a second chat, rename it, delete it, close via Escape and via the × button, and open "New Thread" from the toolbar while the workspace is open to confirm the modal is visible above everything (the z-index fix from Task 5).

- [ ] **Step 5: Record results**

Update `.superpowers/sdd/progress.md` (create it if this is the first task recorded) with the outcome of Steps 1-4, following this project's established ledger format — from-scratch task list, one line per completed task, plus a clearly-flagged entry for anything Step 3 or 4 surfaced that needed a fix.
