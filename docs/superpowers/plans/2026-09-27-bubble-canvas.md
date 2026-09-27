# Bubble Canvas & Jarvis Launch Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-tier (card ↔ pill) React Flow canvas with click-to-bloom thread bubbles whose open/close is one continuous, interruptible animation, and add a shared-element launch animation from the "Ask Jarvis" button into the Jarvis workspace.

**Architecture:** React Flow stays as the camera (pan/zoom/drag). Each thread is a single `threadCluster` node that renders both its collapsed dashboard bubble and its open task cluster, animating between them with framer-motion springs. Cluster geometry comes from a pure, unit-tested ring-packing function. Thread positions persist per user in a new additive `ThreadPosition` table; open/closed state lives in `localStorage`.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, @xyflow/react 12.11, framer-motion 13.2, Prisma 7 (Postgres), Tailwind 4, Vitest + Testing Library (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-27-bubble-canvas-design.md`

## Global Constraints

- **Never reset or clear the database.** The migration is additive only. Apply it with `npx prisma migrate deploy` (never `migrate reset`, never `migrate dev`, which can prompt for a reset on drift). **Ask the user before running `migrate deploy`.**
- **Never run integration tests** (`tests/integration/**`). Their `resetDb()` wipes the live Supabase `DATABASE_URL`. Write them, but don't run them.
- **Don't run e2e tests** (`npm run test:e2e`) without the user's explicit go-ahead. They write to the live DB.
- Run only the specific test files a task touches (`npx vitest run <file>`), not the whole suite, except in the final verification task, which runs `tests/unit` and `tests/component` only.
- Per `AGENTS.md`, this Next.js version differs from training data. Before touching Server Actions or `page.tsx`, skim `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` and follow the existing patterns in `app/actions/*.ts`.
- Priority radii (canvas units): HIGH 34, MEDIUM 29, LOW 24. Add-task slot 24. Center × bubble radius 26 (52px hit area). Collapsed thread bubble diameter 150.
- Priority marks: HIGH `!!!`, MEDIUM `!!`, LOW `!`. Bubble fill is the thread's category color. DONE is faded with a check and placed on the outer ring. IN_PROGRESS gets a pulsing outline.
- Timings: camera glide 500 ms on open; zoom buttons 300 ms; task stagger 25 ms (capped at 300 ms); Jarvis reveal 450 ms with ease `[0.22, 1, 0.36, 1]` (the project's `--ease-out-soft`); reduced motion uses ~150 ms opacity fades and 0 ms camera moves.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Map

| File | Action | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | Modify | `ThreadPosition` model + back-relations |
| `prisma/migrations/20260927000000_add_thread_position/migration.sql` | Create | Additive SQL |
| `app/actions/threadPositions.ts` | Create | `saveThreadPosition` Server Action |
| `tests/integration/threadPositions.test.ts` | Create (not run) | Action integration test |
| `tests/helpers/resetDb.ts` | Modify | Clear `threadPosition` |
| `components/canvas/clusterLayout.ts` | Create | Pure ring packing |
| `components/canvas/threadLayout.ts` | Create | Default thread grid, overlap test, camera zoom |
| `components/canvas/threadSummary.ts` | Create | Counts, aria labels, `!` marks |
| `components/canvas/useOpenThreads.ts` | Create | Open-thread state + `localStorage` |
| `components/canvas/useLongPress.ts` | Create | Long-press/right-click hook |
| `components/canvas/CardMenu.tsx` | Modify | Optional controlled mode (`open`/`onOpenChange`/`hideTrigger`) |
| `components/canvas/NewTaskButton.tsx` | Modify | Optional `renderTrigger` |
| `components/canvas/TaskBubble.tsx` | Create | One task bubble |
| `components/canvas/ThreadDashboard.tsx` | Create | Collapsed bubble contents |
| `components/canvas/ThreadClusterNode.tsx` | Create | The React Flow node |
| `components/canvas/Canvas.tsx` | Modify | Wire everything, remove tiers |
| `app/(app)/canvas/page.tsx` | Modify | Load thread positions, pass `userId` |
| `components/canvas/layout.ts` | Modify | Remove `computeThreadCentroid` |
| `components/canvas/zoomTier.ts`, `TaskNode.tsx`, `ThreadBubbleNode.tsx` | Delete | Replaced |
| `tests/unit/zoomTier.test.ts`, `tests/component/TaskNode.test.tsx`, `tests/component/ThreadBubbleNode.test.tsx` | Delete | Replaced |
| `tests/unit/layout.test.ts` | Modify | Drop centroid cases |
| `components/jarvis/JarvisLauncherTransition.tsx` | Create | Clip-path reveal wrapper |
| `components/jarvis/JarvisPanel.tsx`, `JarvisChat.tsx` | Modify | `buttonRef`, shared `layoutId` orb |
| `tests/setupTests.ts` | Modify | `MotionGlobalConfig.skipAnimations = true` |
| `tests/e2e/*.spec.ts` | Modify (not run) | Open threads instead of zoom tiers |

---

### Task 1: ThreadPosition model, migration and Server Action

**Files:**
- Modify: `prisma/schema.prisma` (the `User` model around line 55–67, the `Thread` model around line 69–85, plus a new model after `TaskPosition`, line ~147)
- Create: `prisma/migrations/20260927000000_add_thread_position/migration.sql`
- Create: `app/actions/threadPositions.ts`
- Create: `tests/integration/threadPositions.test.ts`
- Modify: `tests/helpers/resetDb.ts`

**Interfaces:**
- Produces: `saveThreadPosition(threadId: string, positionX: number, positionY: number): Promise<ThreadPosition>` (throws `PermissionError` if the caller can't view the thread). Prisma: `db.threadPosition` with compound key `threadId_userId`.

- [ ] **Step 1: Add the model to `prisma/schema.prisma`**

After the `TaskPosition` model add:

```prisma
model ThreadPosition {
  threadId  String
  userId    String
  // Cascade: lib/purge.ts and app/actions/recycleBin.ts hard-delete
  // threads; a RESTRICT FK here would make those purges fail.
  thread    Thread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  user      User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  positionX Float
  positionY Float

  @@id([threadId, userId])
}
```

In `model Thread`, after `summary        ThreadSummary?`, add:

```prisma
  positions      ThreadPosition[]
```

In `model User`, after `taskPositions  TaskPosition[]`, add:

```prisma
  threadPositions ThreadPosition[]
```

- [ ] **Step 2: Write the migration SQL by hand**

Create `prisma/migrations/20260927000000_add_thread_position/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "ThreadPosition" (
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "positionX" DOUBLE PRECISION NOT NULL,
    "positionY" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ThreadPosition_pkey" PRIMARY KEY ("threadId","userId")
);

-- AddForeignKey
ALTER TABLE "ThreadPosition" ADD CONSTRAINT "ThreadPosition_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadPosition" ADD CONSTRAINT "ThreadPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Check the SQL matches the schema, then generate the client**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid`

Run: `npx prisma generate`
Expected: `Generated Prisma Client`

- [ ] **Step 4: Ask the user, then apply the migration (additive, no reset)**

Ask the user: "OK to run `npx prisma migrate deploy`? It only adds the new `ThreadPosition` table." Once they confirm:

Run: `npx prisma migrate deploy`
Expected: `Applying migration 20260927000000_add_thread_position` … `All migrations have been successfully applied.`
If it reports drift or asks to reset, **stop and report to the user**. Don't reset.

- [ ] **Step 5: Write the Server Action**

Create `app/actions/threadPositions.ts`:

```ts
"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { resolveThreadRole, canViewThread, PermissionError } from "@/lib/permissions";

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
}

// Where a thread's bubble sits on the caller's own canvas. Per-user (like
// TaskPosition), so a viewer dragging a shared thread only rearranges
// their own view — which is why VIEWER access is enough.
export async function saveThreadPosition(threadId: string, positionX: number, positionY: number) {
  const userId = await requireUserId();
  await requireViewRole(threadId, userId);
  return db.threadPosition.upsert({
    where: { threadId_userId: { threadId, userId } },
    create: { threadId, userId, positionX, positionY },
    update: { positionX, positionY },
  });
}
```

- [ ] **Step 6: Add `threadPosition` to `resetDb`**

In `tests/helpers/resetDb.ts`, add `await db.threadPosition.deleteMany();` immediately after `await db.taskPosition.deleteMany();`.

- [ ] **Step 7: Write the integration test (DON'T RUN IT)**

Create `tests/integration/threadPositions.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { createThread } from "@/app/actions/threads";
import { saveThreadPosition } from "@/app/actions/threadPositions";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("thread positions", () => {
  let ownerId: string;
  let viewerId: string;
  let strangerId: string;
  let threadId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = (await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } })).id;
    viewerId = (await db.user.create({ data: { email: "viewer@x.com", passwordHash: "x", name: "Viewer" } })).id;
    strangerId = (await db.user.create({ data: { email: "stranger@x.com", passwordHash: "x", name: "S" } })).id;
    await loginAs(ownerId);
    threadId = (await createThread({ name: "Launch", categoryColor: "#7f77dd" })).id;
    await db.threadShare.create({ data: { threadId, sharedWithUserId: viewerId, permission: "VIEWER" } });
  });
  afterAll(async () => db.$disconnect());

  it("stores positions per user and upserts on repeat saves", async () => {
    await loginAs(ownerId);
    await saveThreadPosition(threadId, 1, 1);
    await saveThreadPosition(threadId, 10, 20);
    await loginAs(viewerId);
    await saveThreadPosition(threadId, 500, 600);

    const owner = await db.threadPosition.findMany({ where: { userId: ownerId } });
    const viewer = await db.threadPosition.findMany({ where: { userId: viewerId } });
    expect(owner).toHaveLength(1);
    expect(owner[0]).toMatchObject({ positionX: 10, positionY: 20 });
    expect(viewer[0]).toMatchObject({ positionX: 500, positionY: 600 });
  });

  it("rejects a user with no access to the thread", async () => {
    await loginAs(strangerId);
    await expect(saveThreadPosition(threadId, 1, 1)).rejects.toThrow();
  });

  it("is removed when the thread is hard-deleted", async () => {
    await loginAs(ownerId);
    await saveThreadPosition(threadId, 1, 1);
    await db.threadShare.deleteMany({ where: { threadId } });
    await db.thread.delete({ where: { id: threadId } });
    expect(await db.threadPosition.count()).toBe(0);
  });
});
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260927000000_add_thread_position app/actions/threadPositions.ts tests/integration/threadPositions.test.ts tests/helpers/resetDb.ts
git commit -m "Add per-user ThreadPosition model and saveThreadPosition action

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Cluster ring-packing layout

**Files:**
- Create: `components/canvas/clusterLayout.ts`
- Test: `tests/unit/clusterLayout.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type Priority = "LOW" | "MEDIUM" | "HIGH";
  type WorkStatus = "TODO" | "IN_PROGRESS" | "DONE";
  type ClusterTaskInput = { id: string; title: string; priority: Priority; workStatus: WorkStatus };
  type ClusterBubble = { id: string; x: number; y: number; r: number; ring: number };
  type ClusterLayout = { bubbles: ClusterBubble[]; radius: number };
  const ADD_SLOT_ID = "__add__";
  const CENTER_RADIUS = 26; const BUBBLE_GAP = 6;
  const PRIORITY_RADIUS: Record<Priority, number>; // HIGH 34, MEDIUM 29, LOW 24
  function clusterLayout(tasks: ClusterTaskInput[], opts: { includeAddSlot: boolean }): ClusterLayout;
  ```
  Coordinates are relative to the cluster center (the × bubble). `radius` is the distance from the center to the farthest bubble edge (≥ `CENTER_RADIUS`).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/clusterLayout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  clusterLayout,
  ADD_SLOT_ID,
  CENTER_RADIUS,
  BUBBLE_GAP,
  PRIORITY_RADIUS,
  type ClusterTaskInput,
} from "@/components/canvas/clusterLayout";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
const STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const;

function makeTasks(n: number): ClusterTaskInput[] {
  // Deterministic spread of priorities/statuses, no randomness.
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    title: `Task ${String(i).padStart(2, "0")}`,
    priority: PRIORITIES[(i * 7) % 3],
    workStatus: STATUSES[(i * 5) % 3],
  }));
}

describe("clusterLayout", () => {
  it("returns just the center radius for no tasks and no add slot", () => {
    expect(clusterLayout([], { includeAddSlot: false })).toEqual({ bubbles: [], radius: CENTER_RADIUS });
  });

  it("places only the add slot for an empty thread when requested", () => {
    const { bubbles } = clusterLayout([], { includeAddSlot: true });
    expect(bubbles.map((b) => b.id)).toEqual([ADD_SLOT_ID]);
  });

  it("sizes bubbles by priority", () => {
    const { bubbles } = clusterLayout(
      [
        { id: "h", title: "a", priority: "HIGH", workStatus: "TODO" },
        { id: "m", title: "b", priority: "MEDIUM", workStatus: "TODO" },
        { id: "l", title: "c", priority: "LOW", workStatus: "TODO" },
      ],
      { includeAddSlot: false }
    );
    const r = Object.fromEntries(bubbles.map((b) => [b.id, b.r]));
    expect(r).toEqual({ h: PRIORITY_RADIUS.HIGH, m: PRIORITY_RADIUS.MEDIUM, l: PRIORITY_RADIUS.LOW });
  });

  it.each([1, 3, 7, 12, 25, 50])("never overlaps bubbles or the center with %i tasks", (n) => {
    const { bubbles, radius } = clusterLayout(makeTasks(n), { includeAddSlot: true });
    for (const b of bubbles) {
      expect(Math.hypot(b.x, b.y)).toBeGreaterThanOrEqual(CENTER_RADIUS + b.r + BUBBLE_GAP - 1e-6);
      expect(Math.hypot(b.x, b.y) + b.r).toBeLessThanOrEqual(radius + 1e-6);
    }
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const a = bubbles[i];
        const b = bubbles[j];
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r + BUBBLE_GAP - 1e-6);
      }
    }
  });

  it("orders unfinished tasks HIGH → MEDIUM → LOW, then by title", () => {
    const tasks: ClusterTaskInput[] = [
      { id: "l", title: "Zed", priority: "LOW", workStatus: "TODO" },
      { id: "m2", title: "Beta", priority: "MEDIUM", workStatus: "IN_PROGRESS" },
      { id: "h", title: "Omega", priority: "HIGH", workStatus: "TODO" },
      { id: "m1", title: "Alpha", priority: "MEDIUM", workStatus: "TODO" },
    ];
    const ids = clusterLayout(tasks, { includeAddSlot: false }).bubbles.map((b) => b.id);
    expect(ids).toEqual(["h", "m1", "m2", "l"]);
  });

  it("puts DONE tasks on rings strictly outside every unfinished task and the add slot", () => {
    const { bubbles } = clusterLayout(makeTasks(30), { includeAddSlot: true });
    const doneIds = new Set(makeTasks(30).filter((t) => t.workStatus === "DONE").map((t) => t.id));
    const doneRings = bubbles.filter((b) => doneIds.has(b.id)).map((b) => b.ring);
    const otherRings = bubbles.filter((b) => !doneIds.has(b.id)).map((b) => b.ring);
    expect(Math.min(...doneRings)).toBeGreaterThan(Math.max(...otherRings));
  });

  it("places the add slot after the last unfinished task", () => {
    const ids = clusterLayout(
      [
        { id: "d", title: "x", priority: "HIGH", workStatus: "DONE" },
        { id: "t", title: "y", priority: "LOW", workStatus: "TODO" },
      ],
      { includeAddSlot: true }
    ).bubbles.map((b) => b.id);
    expect(ids).toEqual(["t", ADD_SLOT_ID, "d"]);
  });

  it("starts the first ring at the top (negative y, x ≈ 0) for a single task", () => {
    const [b] = clusterLayout([{ id: "a", title: "a", priority: "LOW", workStatus: "TODO" }], {
      includeAddSlot: false,
    }).bubbles;
    expect(b.x).toBeCloseTo(0);
    expect(b.y).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/unit/clusterLayout.test.ts`
Expected: FAIL, "Failed to resolve import "@/components/canvas/clusterLayout"".

- [ ] **Step 3: Implement**

Create `components/canvas/clusterLayout.ts`:

```ts
export type Priority = "LOW" | "MEDIUM" | "HIGH";
export type WorkStatus = "TODO" | "IN_PROGRESS" | "DONE";
export type ClusterTaskInput = { id: string; title: string; priority: Priority; workStatus: WorkStatus };
export type ClusterBubble = { id: string; x: number; y: number; r: number; ring: number };
export type ClusterLayout = { bubbles: ClusterBubble[]; radius: number };

// Pseudo-task id for the "+ Add task" bubble at the end of the unfinished tasks.
export const ADD_SLOT_ID = "__add__";
// The × bubble at the cluster's center (52px hit area).
export const CENTER_RADIUS = 26;
// Minimum clear space between any two bubbles' edges.
export const BUBBLE_GAP = 6;
export const PRIORITY_RADIUS: Record<Priority, number> = { HIGH: 34, MEDIUM: 29, LOW: 24 };
const ADD_SLOT_RADIUS = 24;
const PRIORITY_ORDER: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

type Item = { id: string; r: number };

function byPriorityThenTitle(a: ClusterTaskInput, b: ClusterTaskInput) {
  return (
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    a.title.localeCompare(b.title) ||
    a.id.localeCompare(b.id)
  );
}

// Angular width a bubble of radius r occupies on a ring of radius R,
// including half the gap on each side. Two neighbours separated by the
// sum of their half-widths are at least r1 + r2 + BUBBLE_GAP apart
// (2·sin((A+B)/2) ≥ sin A + sin B for A, B in [0, π/2]).
function angularWidth(r: number, R: number) {
  return 2 * Math.asin(Math.min(1, (r + BUBBLE_GAP / 2) / R));
}

/**
 * Packs a thread's tasks into concentric rings around the center × bubble.
 * Each group (unfinished + add slot, then DONE) starts on a fresh ring, so
 * DONE tasks always sit outside everything else. Each ring's radius clears
 * the previous ring's outer edge by BUBBLE_GAP, and bubbles on a ring are
 * spread evenly around it, starting at the top.
 */
export function clusterLayout(tasks: ClusterTaskInput[], opts: { includeAddSlot: boolean }): ClusterLayout {
  const unfinished: Item[] = tasks
    .filter((t) => t.workStatus !== "DONE")
    .sort(byPriorityThenTitle)
    .map((t) => ({ id: t.id, r: PRIORITY_RADIUS[t.priority] }));
  if (opts.includeAddSlot) unfinished.push({ id: ADD_SLOT_ID, r: ADD_SLOT_RADIUS });
  const done: Item[] = tasks
    .filter((t) => t.workStatus === "DONE")
    .sort(byPriorityThenTitle)
    .map((t) => ({ id: t.id, r: PRIORITY_RADIUS[t.priority] }));

  const bubbles: ClusterBubble[] = [];
  let ring = 0;
  let prevOuter = CENTER_RADIUS;

  for (const group of [unfinished, done]) {
    let i = 0;
    while (i < group.length) {
      const maxRemaining = Math.max(...group.slice(i).map((item) => item.r));
      const R = prevOuter + BUBBLE_GAP + maxRemaining;
      const members: Item[] = [];
      let used = 0;
      while (i < group.length) {
        const w = angularWidth(group[i].r, R);
        if (members.length > 0 && used + w > 2 * Math.PI) break;
        members.push(group[i]);
        used += w;
        i++;
      }
      const slack = (2 * Math.PI - used) / members.length;
      let cursor = -Math.PI / 2 - angularWidth(members[0].r, R) / 2;
      for (const m of members) {
        const w = angularWidth(m.r, R);
        const angle = cursor + w / 2;
        bubbles.push({ id: m.id, x: R * Math.cos(angle), y: R * Math.sin(angle), r: m.r, ring });
        cursor += w + slack;
      }
      prevOuter = R + Math.max(...members.map((m) => m.r));
      ring++;
    }
  }

  const radius = bubbles.reduce((max, b) => Math.max(max, Math.hypot(b.x, b.y) + b.r), CENTER_RADIUS);
  return { bubbles, radius };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run tests/unit/clusterLayout.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add components/canvas/clusterLayout.ts tests/unit/clusterLayout.test.ts
git commit -m "Add ring-packing layout for thread task clusters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Thread layout, camera zoom and summary helpers

**Files:**
- Create: `components/canvas/threadLayout.ts`
- Create: `components/canvas/threadSummary.ts`
- Test: `tests/unit/threadLayout.test.ts`, `tests/unit/threadSummary.test.ts`

**Interfaces:**
- Consumes: `Priority`, `WorkStatus` from `clusterLayout.ts`.
- Produces:
  ```ts
  // threadLayout.ts
  const COLLAPSED_DIAMETER = 150;
  function defaultThreadPosition(index: number): { x: number; y: number };
  function clustersOverlap(a: { x: number; y: number; r: number }, b: { x: number; y: number; r: number }): boolean;
  function cameraZoomForCluster(currentZoom: number, viewport: { width: number; height: number }, clusterRadius: number, padding: number): number;
  // threadSummary.ts
  type ThreadTaskSummary = { high: number; medium: number; low: number; done: number; total: number };
  function summarizeThread(tasks: { priority: Priority; workStatus: WorkStatus }[]): ThreadTaskSummary;
  function threadAriaLabel(name: string, s: ThreadTaskSummary): string;
  function taskAriaLabel(task: { title: string; priority: Priority; workStatus: WorkStatus }): string;
  function priorityMarks(p: Priority): "!!!" | "!!" | "!";
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/threadLayout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { defaultThreadPosition, clustersOverlap, cameraZoomForCluster } from "@/components/canvas/threadLayout";

describe("defaultThreadPosition", () => {
  it("lays threads out on a 3-column grid, 520 units apart", () => {
    expect(defaultThreadPosition(0)).toEqual({ x: 0, y: 0 });
    expect(defaultThreadPosition(2)).toEqual({ x: 1040, y: 0 });
    expect(defaultThreadPosition(3)).toEqual({ x: 0, y: 520 });
  });
});

describe("clustersOverlap", () => {
  it("is true only when the circles intersect", () => {
    expect(clustersOverlap({ x: 0, y: 0, r: 100 }, { x: 150, y: 0, r: 75 })).toBe(true);
    expect(clustersOverlap({ x: 0, y: 0, r: 100 }, { x: 200, y: 0, r: 75 })).toBe(false);
  });
});

describe("cameraZoomForCluster", () => {
  const viewport = { width: 1000, height: 800 };
  // fit = 800 / (2 * (152 + 48)) = 2 → target capped at 1.2
  it("keeps the current zoom when the cluster already fits and is readable", () => {
    expect(cameraZoomForCluster(1, viewport, 152, 48)).toBe(1);
  });
  it("zooms in to a readable level when currently zoomed far out", () => {
    expect(cameraZoomForCluster(0.3, viewport, 152, 48)).toBe(1.2);
  });
  it("zooms out when the cluster doesn't fit at the current zoom", () => {
    // fit = 800 / (2 * (352 + 48)) = 1
    expect(cameraZoomForCluster(1.5, viewport, 352, 48)).toBe(1);
  });
});
```

Create `tests/unit/threadSummary.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { summarizeThread, threadAriaLabel, taskAriaLabel, priorityMarks } from "@/components/canvas/threadSummary";

describe("summarizeThread", () => {
  it("counts unfinished tasks by priority and done tasks separately", () => {
    expect(
      summarizeThread([
        { priority: "HIGH", workStatus: "TODO" },
        { priority: "HIGH", workStatus: "DONE" },
        { priority: "MEDIUM", workStatus: "IN_PROGRESS" },
        { priority: "LOW", workStatus: "TODO" },
      ])
    ).toEqual({ high: 1, medium: 1, low: 1, done: 1, total: 4 });
  });
});

describe("labels", () => {
  it("describes a thread for screen readers", () => {
    expect(threadAriaLabel("Launch", { high: 2, medium: 3, low: 2, done: 1, total: 8 })).toBe(
      "Launch — 2 high, 3 medium, 2 low open, 1 done. Open thread"
    );
    expect(threadAriaLabel("Empty", { high: 0, medium: 0, low: 0, done: 0, total: 0 })).toBe(
      "Empty — no tasks. Open thread"
    );
  });

  it("describes a task with its priority and status", () => {
    expect(taskAriaLabel({ title: "Ship API", priority: "HIGH", workStatus: "IN_PROGRESS" })).toBe(
      "Ship API, high priority, in progress"
    );
    expect(taskAriaLabel({ title: "Docs", priority: "LOW", workStatus: "DONE" })).toBe("Docs, low priority, done");
    expect(taskAriaLabel({ title: "Plan", priority: "MEDIUM", workStatus: "TODO" })).toBe("Plan, medium priority");
  });

  it("maps priorities to exclamation marks", () => {
    expect([priorityMarks("HIGH"), priorityMarks("MEDIUM"), priorityMarks("LOW")]).toEqual(["!!!", "!!", "!"]);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/unit/threadLayout.test.ts tests/unit/threadSummary.test.ts`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement**

Create `components/canvas/threadLayout.ts`:

```ts
// Diameter of a collapsed thread bubble, in canvas units.
export const COLLAPSED_DIAMETER = 150;

// Default grid for threads the user has never dragged. Wide enough that a
// typical open cluster (~10 tasks, radius ~150) doesn't reach its neighbour.
const THREAD_GRID_SPACING = 520;
const THREAD_GRID_COLUMNS = 3;

export function defaultThreadPosition(index: number): { x: number; y: number } {
  return {
    x: (index % THREAD_GRID_COLUMNS) * THREAD_GRID_SPACING,
    y: Math.floor(index / THREAD_GRID_COLUMNS) * THREAD_GRID_SPACING,
  };
}

type Circle = { x: number; y: number; r: number };

export function clustersOverlap(a: Circle, b: Circle): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r;
}

const MAX_FOCUS_ZOOM = 1.2;
const MIN_READABLE_ZOOM = 0.8;

/**
 * Zoom to use when gliding the camera to a just-opened cluster: keep the
 * current zoom (pan only) if the cluster already fits and is readable,
 * otherwise the zoom that fits it, capped at MAX_FOCUS_ZOOM.
 */
export function cameraZoomForCluster(
  currentZoom: number,
  viewport: { width: number; height: number },
  clusterRadius: number,
  padding: number
): number {
  const fit = Math.min(viewport.width, viewport.height) / (2 * (clusterRadius + padding));
  const target = Math.min(fit, MAX_FOCUS_ZOOM);
  if (currentZoom <= fit && currentZoom >= Math.min(target, MIN_READABLE_ZOOM)) return currentZoom;
  return target;
}
```

Create `components/canvas/threadSummary.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run tests/unit/threadLayout.test.ts tests/unit/threadSummary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/canvas/threadLayout.ts components/canvas/threadSummary.ts tests/unit/threadLayout.test.ts tests/unit/threadSummary.test.ts
git commit -m "Add thread grid, camera zoom and summary helpers for the bubble canvas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Open-thread state hook

**Files:**
- Create: `components/canvas/useOpenThreads.ts`
- Test: `tests/unit/useOpenThreads.test.ts`

**Interfaces:**
- Produces:
  ```ts
  function useOpenThreads(userId: string): {
    openIds: string[];              // least → most recently opened
    isOpen: (id: string) => boolean;
    open: (id: string) => void;     // moves id to most recent
    close: (id: string) => void;
    closeMostRecent: () => void;
  };
  ```
  Persisted to `localStorage` under `arc.openThreads.<userId>`. Loaded after mount (not during render) to avoid hydration mismatches.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/useOpenThreads.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useOpenThreads } from "@/components/canvas/useOpenThreads";

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("useOpenThreads", () => {
  it("opens, closes and tracks recency", () => {
    const { result } = renderHook(() => useOpenThreads("u1"));
    act(() => result.current.open("a"));
    act(() => result.current.open("b"));
    act(() => result.current.open("a"));
    expect(result.current.openIds).toEqual(["b", "a"]);
    expect(result.current.isOpen("b")).toBe(true);

    act(() => result.current.closeMostRecent());
    expect(result.current.openIds).toEqual(["b"]);

    act(() => result.current.close("b"));
    expect(result.current.openIds).toEqual([]);
  });

  it("persists per user and restores on remount", async () => {
    const first = renderHook(() => useOpenThreads("u1"));
    act(() => first.result.current.open("a"));
    first.unmount();

    const second = renderHook(() => useOpenThreads("u1"));
    await waitFor(() => expect(second.result.current.openIds).toEqual(["a"]));

    const other = renderHook(() => useOpenThreads("u2"));
    await waitFor(() => expect(other.result.current.openIds).toEqual([]));
  });

  it("falls back to all-closed when storage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useOpenThreads("u1"));
    await waitFor(() => expect(result.current.openIds).toEqual([]));
    act(() => result.current.open("a"));
    expect(result.current.openIds).toEqual(["a"]);
  });

  it("ignores malformed stored data", async () => {
    window.localStorage.setItem("arc.openThreads.u1", '{"not":"an array"}');
    const { result } = renderHook(() => useOpenThreads("u1"));
    await waitFor(() => expect(result.current.openIds).toEqual([]));
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/unit/useOpenThreads.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 3: Implement**

Create `components/canvas/useOpenThreads.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";

function storageKey(userId: string) {
  return `arc.openThreads.${userId}`;
}

function readStored(userId: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

// Which thread clusters are open on the canvas, most recently opened last
// (so Esc can close the newest one). A per-viewer convenience, so it lives
// in localStorage rather than the database; it's read after mount because
// the server render can't see it.
export function useOpenThreads(userId: string) {
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setOpenIds(readStored(userId));
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(storageKey(userId), JSON.stringify(openIds));
    } catch {
      // Storage blocked (private mode, quota): open state just won't persist.
    }
  }, [openIds, loaded, userId]);

  const isOpen = useCallback((id: string) => openIds.includes(id), [openIds]);
  const open = useCallback((id: string) => setOpenIds((ids) => [...ids.filter((x) => x !== id), id]), []);
  const close = useCallback((id: string) => setOpenIds((ids) => ids.filter((x) => x !== id)), []);
  const closeMostRecent = useCallback(() => setOpenIds((ids) => ids.slice(0, -1)), []);

  return { openIds, isOpen, open, close, closeMostRecent };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run tests/unit/useOpenThreads.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/canvas/useOpenThreads.ts tests/unit/useOpenThreads.test.ts
git commit -m "Add useOpenThreads hook with per-user localStorage persistence

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Long-press hook, controlled CardMenu, NewTaskButton trigger, motion test config

**Files:**
- Create: `components/canvas/useLongPress.ts`
- Modify: `components/canvas/CardMenu.tsx`
- Modify: `components/canvas/NewTaskButton.tsx`
- Modify: `tests/setupTests.ts`
- Test: `tests/unit/useLongPress.test.ts`, `tests/component/CardMenu.test.tsx` (append), `tests/component/NewTaskButton.test.tsx` (append)

**Interfaces:**
- Produces:
  ```ts
  function useLongPress(onLongPress: () => void, ms?: number /* 450 */): {
    handlers: { onPointerDown; onPointerMove; onPointerUp; onPointerLeave; onPointerCancel; onContextMenu };
    consumeLongPress: () => boolean; // call first in onClick; true = swallow this click
  };
  // CardMenu: both variants accept optional { open?: boolean; onOpenChange?: (open: boolean) => void; hideTrigger?: boolean }
  // NewTaskButton: optional renderTrigger?: (openDialog: () => void) => ReactNode
  ```

- [ ] **Step 1: Turn off animations in tests**

Append to `tests/setupTests.ts`:

```ts
// framer-motion: finish every animation instantly so AnimatePresence exits
// (closing a thread cluster, closing Jarvis) settle within a waitFor.
import { MotionGlobalConfig } from "framer-motion";
MotionGlobalConfig.skipAnimations = true;
```

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/useLongPress.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type React from "react";
import { useLongPress } from "@/components/canvas/useLongPress";

afterEach(() => vi.useRealTimers());

const down = { button: 0, clientX: 0, clientY: 0 } as React.PointerEvent;

describe("useLongPress", () => {
  it("fires after the hold time and swallows the following click", () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => result.current.handlers.onPointerDown(down));
    act(() => vi.advanceTimersByTime(450));
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(result.current.consumeLongPress()).toBe(true);
    expect(result.current.consumeLongPress()).toBe(false);
  });

  it("is cancelled by releasing early or moving more than 8px", () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => result.current.handlers.onPointerDown(down));
    act(() => result.current.handlers.onPointerUp());
    act(() => result.current.handlers.onPointerDown(down));
    act(() => result.current.handlers.onPointerMove({ clientX: 20, clientY: 0 } as React.PointerEvent));
    act(() => vi.advanceTimersByTime(1000));
    expect(onLongPress).not.toHaveBeenCalled();
    expect(result.current.consumeLongPress()).toBe(false);
  });

  it("fires immediately on right-click and prevents the browser menu", () => {
    const onLongPress = vi.fn();
    const preventDefault = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => result.current.handlers.onContextMenu({ preventDefault } as unknown as React.MouseEvent));
    expect(preventDefault).toHaveBeenCalled();
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});
```

Append to `tests/component/CardMenu.test.tsx` (it already imports `render`, `screen`, `fireEvent`, `vi`, `CardMenu`; add any missing imports at the top):

```tsx
describe("CardMenu — controlled mode", () => {
  it("renders the menu without a trigger button when open and hideTrigger are set", () => {
    const onOpenChange = vi.fn();
    const onDelete = vi.fn();
    render(
      <CardMenu
        variant="task"
        hideTrigger
        open
        onOpenChange={onOpenChange}
        onRename={vi.fn()}
        onMoveToThread={vi.fn()}
        onLinkSecondaryThread={vi.fn()}
        onDelete={onDelete}
      />
    );
    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("asks to close on an outside pointerdown", () => {
    const onOpenChange = vi.fn();
    render(
      <CardMenu
        variant="task"
        hideTrigger
        open
        onOpenChange={onOpenChange}
        onRename={vi.fn()}
        onMoveToThread={vi.fn()}
        onLinkSecondaryThread={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    fireEvent.pointerDown(document.body);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
```

Append to `tests/component/NewTaskButton.test.tsx` (add missing imports if needed):

```tsx
describe("NewTaskButton — custom trigger", () => {
  it("uses renderTrigger instead of the default button", () => {
    render(
      <NewTaskButton
        threadId="th1"
        onCreate={vi.fn()}
        renderTrigger={(openDialog) => (
          <button type="button" onClick={openDialog}>
            Add task to Launch
          </button>
        )}
      />
    );
    expect(screen.queryByRole("button", { name: "New task" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add task to Launch" }));
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run tests/unit/useLongPress.test.ts tests/component/CardMenu.test.tsx tests/component/NewTaskButton.test.tsx`
Expected: FAIL. `useLongPress` doesn't resolve, the controlled CardMenu still renders "More actions", and `renderTrigger` is ignored.

- [ ] **Step 4: Implement `useLongPress`**

Create `components/canvas/useLongPress.ts`:

```ts
"use client";

import { useRef } from "react";
import type React from "react";

const MOVE_TOLERANCE_PX = 8;

// Long-press (touch/mouse hold) or right-click opens a context menu. A
// pointer that moves more than a few pixels is a drag (of the thread
// node), not a press. The click that ends a long press is swallowed via
// consumeLongPress() so it doesn't also activate the element.
export function useLongPress(onLongPress: () => void, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  function clear() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }

  return {
    handlers: {
      onPointerDown(e: React.PointerEvent) {
        if (e.button !== 0) return;
        clear();
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        timer.current = setTimeout(() => {
          fired.current = true;
          timer.current = null;
          onLongPress();
        }, ms);
      },
      onPointerMove(e: React.PointerEvent) {
        if (!start.current) return;
        if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > MOVE_TOLERANCE_PX) clear();
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      onContextMenu(e: React.MouseEvent) {
        e.preventDefault();
        clear();
        fired.current = true;
        onLongPress();
      },
    },
    consumeLongPress() {
      const wasLongPress = fired.current;
      fired.current = false;
      return wasLongPress;
    },
  };
}
```

- [ ] **Step 5: Make CardMenu optionally controlled**

In `components/canvas/CardMenu.tsx`:

1. Add `useCallback` to the React import: `import { useCallback, useEffect, useRef, useState } from "react";`
2. Add this type above `TaskMenuProps`, and intersect both variants with it:

```ts
// Optional controlled mode: a parent that opens the menu some other way
// (long-press/right-click on a canvas bubble) passes open/onOpenChange and
// hideTrigger to render just the popover without the ⋮ button.
type ControlProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
};
```

Change `type TaskMenuProps = {` to `type TaskMenuProps = ControlProps & {`, and the same for `ThreadMenuProps`.

3. Replace `const [open, setOpen] = useState(false);` with:

```ts
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = props.open !== undefined;
  const open = isControlled ? props.open! : uncontrolledOpen;
  const { onOpenChange } = props;
  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );
```

4. In the outside-pointerdown effect, change the dependency array from `[open]` to `[open, setOpen]`.
5. Change the trigger's `onClick={() => setOpen((o) => !o)}` to `onClick={() => setOpen(!open)}`.
6. Wrap the `<button aria-label="More actions" …>…</button>` element in `{!props.hideTrigger && ( … )}`.

`startLongPress` (`setTimeout(() => setOpen(true), …)`) and `runAndClose` (`setOpen(false)`) already call `setOpen` with a boolean, so they don't change.

- [ ] **Step 6: Add `renderTrigger` to NewTaskButton**

In `components/canvas/NewTaskButton.tsx`:

1. Change the import to `import { useState, type ReactNode } from "react";`
2. Add `renderTrigger,` to the destructured props, and add this to the props type:

```ts
  // Custom trigger (e.g. the "+" bubble in an open thread cluster). Gets a
  // function that opens the dialog.
  renderTrigger?: (openDialog: () => void) => ReactNode;
```

3. Make the first line inside `if (!open) {` this:

```ts
    if (renderTrigger) return <>{renderTrigger(() => setOpen(true))}</>;
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `npx vitest run tests/unit/useLongPress.test.ts tests/component/CardMenu.test.tsx tests/component/NewTaskButton.test.tsx`
Expected: PASS (new and existing cases).

- [ ] **Step 8: Commit**

```bash
git add components/canvas/useLongPress.ts components/canvas/CardMenu.tsx components/canvas/NewTaskButton.tsx tests/setupTests.ts tests/unit/useLongPress.test.ts tests/component/CardMenu.test.tsx tests/component/NewTaskButton.test.tsx
git commit -m "Add long-press hook, controlled CardMenu and custom NewTaskButton trigger

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: TaskBubble and ThreadDashboard

**Files:**
- Create: `components/canvas/TaskBubble.tsx`
- Create: `components/canvas/ThreadDashboard.tsx`
- Test: `tests/component/TaskBubble.test.tsx`, `tests/component/ThreadDashboard.test.tsx`

**Interfaces:**
- Consumes: `useLongPress`, controlled `CardMenu`, `taskAriaLabel`, `priorityMarks`, `ThreadTaskSummary`, `COLLAPSED_DIAMETER`.
- Produces:
  ```ts
  type TaskBubbleTask = { id: string; title: string; priority: Priority; workStatus: WorkStatus };
  // <TaskBubble task r color compact onOpen onRename onMoveToThread onLinkSecondaryThread onDelete />
  // <ThreadDashboard name color summary />  (renders children for the collapsed button, not a button itself)
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/component/TaskBubble.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import type React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import TaskBubble from "@/components/canvas/TaskBubble";

function setup(overrides: Partial<React.ComponentProps<typeof TaskBubble>> = {}) {
  const props = {
    task: { id: "t1", title: "Ship API", priority: "HIGH" as const, workStatus: "TODO" as const },
    r: 34,
    color: "#7f77dd",
    compact: false,
    onOpen: vi.fn(),
    onRename: vi.fn(),
    onMoveToThread: vi.fn(),
    onLinkSecondaryThread: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  const utils = render(<TaskBubble {...props} />);
  return { ...utils, props };
}

describe("TaskBubble", () => {
  it("shows the title and priority marks, and opens the task on click", () => {
    const { props } = setup();
    const bubble = screen.getByRole("button", { name: "Ship API, high priority" });
    expect(bubble).toHaveTextContent("!!!");
    expect(bubble).toHaveTextContent("Ship API");
    fireEvent.click(bubble);
    expect(props.onOpen).toHaveBeenCalled();
  });

  it("marks DONE tasks as faded with a strikethrough", () => {
    setup({ task: { id: "t1", title: "Docs", priority: "LOW", workStatus: "DONE" } });
    const bubble = screen.getByRole("button", { name: "Docs, low priority, done" });
    expect(bubble.className).toContain("opacity-45");
    expect(screen.getByText("Docs").className).toContain("line-through");
  });

  it("draws a pulsing outline for IN_PROGRESS tasks", () => {
    const { container } = setup({
      task: { id: "t1", title: "Plan", priority: "MEDIUM", workStatus: "IN_PROGRESS" },
    });
    expect(container.querySelector("[data-testid='in-progress-ring']")).not.toBeNull();
  });

  it("opens the task menu on right-click without opening the task", () => {
    const { props } = setup();
    const bubble = screen.getByRole("button", { name: "Ship API, high priority" });
    fireEvent.contextMenu(bubble);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(props.onDelete).toHaveBeenCalled();
    expect(props.onOpen).not.toHaveBeenCalled();
  });
});
```

Create `tests/component/ThreadDashboard.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ThreadDashboard from "@/components/canvas/ThreadDashboard";

describe("ThreadDashboard", () => {
  it("shows the name and per-priority counts of open tasks", () => {
    const { container } = render(
      <ThreadDashboard name="Launch" color="#7f77dd" summary={{ high: 2, medium: 3, low: 1, done: 2, total: 8 }} />
    );
    expect(screen.getByText("Launch")).toBeInTheDocument();
    const counts = container.querySelector("[data-testid='priority-counts']")!;
    expect(counts).toHaveTextContent("!!!2!!3!1");
    expect(container.querySelector("[data-testid='progress-arc']")).not.toBeNull();
  });

  it("says 'No tasks' and hides the progress arc for an empty thread", () => {
    const { container } = render(
      <ThreadDashboard name="Empty" color="#7f77dd" summary={{ high: 0, medium: 0, low: 0, done: 0, total: 0 }} />
    );
    expect(screen.getByText("No tasks")).toBeInTheDocument();
    expect(container.querySelector("[data-testid='progress-arc']")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/component/TaskBubble.test.tsx tests/component/ThreadDashboard.test.tsx`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement TaskBubble**

Create `components/canvas/TaskBubble.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import CardMenu from "./CardMenu";
import { useLongPress } from "./useLongPress";
import { priorityMarks, taskAriaLabel } from "./threadSummary";
import type { Priority, WorkStatus } from "./clusterLayout";

export type TaskBubbleTask = { id: string; title: string; priority: Priority; workStatus: WorkStatus };

const MARK_CLASS: Record<Priority, string> = {
  HIGH: "text-red-500",
  MEDIUM: "text-amber-500",
  LOW: "text-emerald-500",
};

// One task in an open thread cluster. Filled with the thread's color so a
// task always reads as belonging to its thread; priority is the "!" marks
// (and the bubble's size, set by the caller via r). `nodrag` keeps a press
// on a task from dragging the whole thread node.
export default function TaskBubble({
  task,
  r,
  color,
  compact,
  onOpen,
  onRename,
  onMoveToThread,
  onLinkSecondaryThread,
  onDelete,
}: {
  task: TaskBubbleTask;
  r: number;
  color: string;
  // Outer rings of big clusters: one-line title.
  compact: boolean;
  onOpen: () => void;
  onRename: () => void;
  onMoveToThread: () => void;
  onLinkSecondaryThread: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const longPress = useLongPress(() => setMenuOpen(true));
  const done = task.workStatus === "DONE";

  return (
    <div className="nodrag relative" style={{ width: r * 2, height: r * 2 }}>
      {task.workStatus === "IN_PROGRESS" && (
        <span
          aria-hidden
          data-testid="in-progress-ring"
          className="pointer-events-none absolute -inset-1 animate-pulse rounded-full border-2"
          style={{ borderColor: color }}
        />
      )}
      <button
        type="button"
        aria-label={taskAriaLabel(task)}
        {...longPress.handlers}
        onClick={() => {
          if (longPress.consumeLongPress()) return;
          onOpen();
        }}
        className={`flex h-full w-full flex-col items-center justify-center rounded-full border px-1.5 text-center leading-tight text-fg outline-none transition-transform duration-200 ease-[var(--ease-out-soft)] hover:scale-105 focus-visible:ring-2 focus-visible:ring-accent/60 ${
          done ? "opacity-45" : ""
        }`}
        style={{
          background: `color-mix(in srgb, ${color} 22%, var(--surface))`,
          borderColor: `color-mix(in srgb, ${color} 60%, transparent)`,
        }}
      >
        {done ? (
          <Check aria-hidden size={12} strokeWidth={3} className="text-emerald-500" />
        ) : (
          <span aria-hidden className={`text-[11px] font-bold leading-none ${MARK_CLASS[task.priority]}`}>
            {priorityMarks(task.priority)}
          </span>
        )}
        <span
          className={`mt-0.5 w-full overflow-hidden break-words text-[10px] font-medium ${
            compact ? "line-clamp-1" : "line-clamp-2"
          } ${done ? "line-through" : ""}`}
        >
          {task.title}
        </span>
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-0">
          <CardMenu
            variant="task"
            hideTrigger
            open
            onOpenChange={setMenuOpen}
            onRename={onRename}
            onMoveToThread={onMoveToThread}
            onLinkSecondaryThread={onLinkSecondaryThread}
            onDelete={onDelete}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement ThreadDashboard**

Create `components/canvas/ThreadDashboard.tsx`:

```tsx
import { COLLAPSED_DIAMETER } from "./threadLayout";
import type { ThreadTaskSummary } from "./threadSummary";

const RING_RADIUS = COLLAPSED_DIAMETER / 2 - 5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const C = COLLAPSED_DIAMETER / 2;

// Contents of a collapsed thread bubble: name, "!" rows counting open
// tasks by priority, and a done/total progress arc around the edge. The
// caller supplies the button (and its aria-label); this is visual only.
export default function ThreadDashboard({
  name,
  color,
  summary,
}: {
  name: string;
  color: string;
  summary: ThreadTaskSummary;
}) {
  const progress = summary.total ? summary.done / summary.total : 0;
  return (
    <>
      <svg
        aria-hidden
        viewBox={`0 0 ${COLLAPSED_DIAMETER} ${COLLAPSED_DIAMETER}`}
        className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
      >
        <circle cx={C} cy={C} r={RING_RADIUS} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={3} />
        {summary.done > 0 && (
          <circle
            data-testid="progress-arc"
            cx={C}
            cy={C}
            r={RING_RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
            className="transition-[stroke-dashoffset] duration-500 ease-[var(--ease-out-soft)]"
          />
        )}
      </svg>
      <span aria-hidden className="relative max-w-[110px] truncate text-sm font-semibold tracking-tight">
        {name}
      </span>
      {summary.total === 0 ? (
        <span aria-hidden className="relative mt-1 text-xs text-fg/50">
          No tasks
        </span>
      ) : (
        <span
          aria-hidden
          data-testid="priority-counts"
          className="relative mt-1.5 grid grid-cols-[auto_auto] items-baseline gap-x-2 text-xs tabular-nums text-fg/80"
        >
          <span className="text-right font-bold text-red-500">!!!</span>
          <span>{summary.high}</span>
          <span className="text-right font-bold text-amber-500">!!</span>
          <span>{summary.medium}</span>
          <span className="text-right font-bold text-emerald-500">!</span>
          <span>{summary.low}</span>
        </span>
      )}
    </>
  );
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run tests/component/TaskBubble.test.tsx tests/component/ThreadDashboard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/canvas/TaskBubble.tsx components/canvas/ThreadDashboard.tsx tests/component/TaskBubble.test.tsx tests/component/ThreadDashboard.test.tsx
git commit -m "Add TaskBubble and ThreadDashboard components

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: ThreadClusterNode

**Files:**
- Create: `components/canvas/ThreadClusterNode.tsx`
- Test: `tests/component/ThreadClusterNode.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2–6.
- Produces:
  ```ts
  type ThreadClusterData = {
    thread: { id: string; name: string; categoryColor: string };
    tasks: TaskBubbleTask[];
    layout: ClusterLayout;           // computed by Canvas via clusterLayout()
    open: boolean;
    dimmed: boolean;
    canEditMeta: boolean;
    canCloseOrDelete: boolean;
    canEditTasks: boolean;
    onToggle: () => void;
    onHoverChange: (hovered: boolean) => void;
    onOpenTask: (taskId: string) => void;
    onRenameTask: (taskId: string) => void;
    onMoveTask: (taskId: string) => void;
    onLinkTask: (taskId: string) => void;
    onDeleteTask: (taskId: string) => void;
    onRename: () => void;
    onChangeColor: () => void;
    onCloseThread: () => void;
    onDeleteThread: () => void;
    onViewCatchUp: () => void;
    onCreateTask: (input: { title: string; description?: string; dueDate?: Date }) => void;
  };
  function clusterNodeDiameter(open: boolean, layout: ClusterLayout): number;
  // default export: ThreadClusterNode({ id, data }: { id: string; data: ThreadClusterData })
  ```
  Accessible names: collapsed button = `threadAriaLabel(...)`; × = `Close <name>`; add slot = `Add task to <name>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/component/ThreadClusterNode.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ThreadClusterNode, { type ThreadClusterData, clusterNodeDiameter } from "@/components/canvas/ThreadClusterNode";
import { clusterLayout } from "@/components/canvas/clusterLayout";

const tasks = [
  { id: "t1", title: "Ship API", priority: "HIGH" as const, workStatus: "TODO" as const },
  { id: "t2", title: "Write docs", priority: "LOW" as const, workStatus: "DONE" as const },
];

function makeData(overrides: Partial<ThreadClusterData> = {}): ThreadClusterData {
  const canEditTasks = overrides.canEditTasks ?? true;
  return {
    thread: { id: "th1", name: "Launch", categoryColor: "#7f77dd" },
    tasks,
    layout: clusterLayout(tasks, { includeAddSlot: canEditTasks }),
    open: false,
    dimmed: false,
    canEditMeta: true,
    canCloseOrDelete: true,
    canEditTasks,
    onToggle: vi.fn(),
    onHoverChange: vi.fn(),
    onOpenTask: vi.fn(),
    onRenameTask: vi.fn(),
    onMoveTask: vi.fn(),
    onLinkTask: vi.fn(),
    onDeleteTask: vi.fn(),
    onRename: vi.fn(),
    onChangeColor: vi.fn(),
    onCloseThread: vi.fn(),
    onDeleteThread: vi.fn(),
    onViewCatchUp: vi.fn(),
    onCreateTask: vi.fn(),
    ...overrides,
  };
}

describe("ThreadClusterNode", () => {
  it("collapsed: shows the dashboard button and no task bubbles or ×", () => {
    const data = makeData();
    render(<ThreadClusterNode id="th1" data={data} />);
    const bubble = screen.getByRole("button", { name: "Launch — 1 high, 0 medium, 0 low open, 1 done. Open thread" });
    expect(screen.queryByRole("button", { name: "Close Launch" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Ship API/ })).not.toBeInTheDocument();
    fireEvent.click(bubble);
    expect(data.onToggle).toHaveBeenCalled();
  });

  it("open: shows the ×, every task bubble and the add slot; × toggles closed", () => {
    const data = makeData({ open: true });
    render(<ThreadClusterNode id="th1" data={data} />);
    expect(screen.queryByRole("button", { name: /Open thread$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ship API, high priority" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write docs, low priority, done" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add task to Launch" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close Launch" }));
    expect(data.onToggle).toHaveBeenCalled();
  });

  it("clicking a task bubble opens that task", () => {
    const data = makeData({ open: true });
    render(<ThreadClusterNode id="th1" data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Ship API, high priority" }));
    expect(data.onOpenTask).toHaveBeenCalledWith("t1");
  });

  it("removes task bubbles after closing", async () => {
    const data = makeData({ open: true });
    const { rerender } = render(<ThreadClusterNode id="th1" data={data} />);
    rerender(<ThreadClusterNode id="th1" data={{ ...data, open: false }} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Ship API/ })).not.toBeInTheDocument());
  });

  it("hides the add slot when the user can't edit tasks", () => {
    render(<ThreadClusterNode id="th1" data={makeData({ open: true, canEditTasks: false })} />);
    expect(screen.queryByRole("button", { name: "Add task to Launch" })).not.toBeInTheDocument();
  });

  it("collapsed ⋮ menu is gated by permissions", () => {
    render(<ThreadClusterNode id="th1" data={makeData({ canCloseOrDelete: false })} />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menuitem", { name: "Rename thread" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete thread" })).not.toBeInTheDocument();
  });

  it("right-clicking the × opens the thread menu", () => {
    const data = makeData({ open: true });
    render(<ThreadClusterNode id="th1" data={data} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "Close Launch" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "View catch-up" }));
    expect(data.onViewCatchUp).toHaveBeenCalled();
    expect(data.onToggle).not.toHaveBeenCalled();
  });

  it("sizes the node to the collapsed bubble, or the open cluster plus margin", () => {
    const layout = clusterLayout(tasks, { includeAddSlot: true });
    expect(clusterNodeDiameter(false, layout)).toBe(150);
    expect(clusterNodeDiameter(true, layout)).toBe(Math.max(150, 2 * (layout.radius + 16)));
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/component/ThreadClusterNode.test.tsx`
Expected: FAIL, unresolved import.

- [ ] **Step 3: Implement**

Create `components/canvas/ThreadClusterNode.tsx`:

```tsx
"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "framer-motion";
import { Plus, X } from "lucide-react";
import CardMenu from "./CardMenu";
import NewTaskButton from "./NewTaskButton";
import TaskBubble, { type TaskBubbleTask } from "./TaskBubble";
import ThreadDashboard from "./ThreadDashboard";
import { useLongPress } from "./useLongPress";
import { ADD_SLOT_ID, CENTER_RADIUS, type ClusterLayout } from "./clusterLayout";
import { COLLAPSED_DIAMETER } from "./threadLayout";
import { summarizeThread, threadAriaLabel } from "./threadSummary";

export type ThreadClusterData = {
  thread: { id: string; name: string; categoryColor: string };
  tasks: TaskBubbleTask[];
  layout: ClusterLayout;
  open: boolean;
  dimmed: boolean;
  canEditMeta: boolean;
  canCloseOrDelete: boolean;
  canEditTasks: boolean;
  onToggle: () => void;
  onHoverChange: (hovered: boolean) => void;
  onOpenTask: (taskId: string) => void;
  onRenameTask: (taskId: string) => void;
  onMoveTask: (taskId: string) => void;
  onLinkTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onRename: () => void;
  onChangeColor: () => void;
  onCloseThread: () => void;
  onDeleteThread: () => void;
  onViewCatchUp: () => void;
  onCreateTask: (input: { title: string; description?: string; dueDate?: Date }) => void;
};

const CLUSTER_MARGIN = 16;
const SPRING: Transition = { type: "spring", stiffness: 260, damping: 24 };
const FADE: Transition = { duration: 0.15 };
const HALF = COLLAPSED_DIAMETER / 2;

export function clusterNodeDiameter(open: boolean, layout: ClusterLayout): number {
  return open ? Math.max(COLLAPSED_DIAMETER, 2 * (layout.radius + CLUSTER_MARGIN)) : COLLAPSED_DIAMETER;
}

// One React Flow node per thread. Collapsed and open states live in one
// component tree so opening/closing is a single continuous animation: the
// dashboard bubble shrinks into the center as the × grows out of it, and
// task bubbles spring out from (and back into) the center. Every motion is
// a spring from current values, so reversing mid-animation never snaps.
// The node is rendered with nodeOrigin [0.5, 0.5], so growing the node
// keeps it centred on the thread's position.
export default function ThreadClusterNode({ data }: { id: string; data: ThreadClusterData }) {
  const reduced = useReducedMotion();
  const [closeMenuOpen, setCloseMenuOpen] = useState(false);
  const closeLongPress = useLongPress(() => setCloseMenuOpen(true));
  const { thread, tasks, layout, open } = data;
  const color = thread.categoryColor;
  const summary = summarizeThread(tasks);
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const transition = reduced ? FADE : SPRING;
  const count = layout.bubbles.length;

  const threadMenu = {
    variant: "thread" as const,
    onRename: data.onRename,
    onChangeColor: data.onChangeColor,
    onClose: data.onCloseThread,
    onDelete: data.onDeleteThread,
    onViewCatchUp: data.onViewCatchUp,
    canEditMeta: data.canEditMeta,
    canCloseOrDelete: data.canCloseOrDelete,
  };

  const size = clusterNodeDiameter(open, layout);

  return (
    <motion.div
      className="relative"
      initial={false}
      animate={{ width: size, height: size, opacity: data.dimmed ? 0.5 : 1 }}
      transition={transition}
      onPointerEnter={() => data.onHoverChange(true)}
      onPointerLeave={() => data.onHoverChange(false)}
    >
      <motion.div
        className="absolute left-1/2 top-1/2"
        style={{ width: COLLAPSED_DIAMETER, height: COLLAPSED_DIAMETER, marginLeft: -HALF, marginTop: -HALF }}
        initial={false}
        animate={{ scale: open ? 0.25 : 1, opacity: open ? 0 : 1 }}
        transition={transition}
      >
        <button
          type="button"
          aria-label={threadAriaLabel(thread.name, summary)}
          aria-hidden={open || undefined}
          tabIndex={open ? -1 : 0}
          onClick={data.onToggle}
          className={`relative flex h-full w-full flex-col items-center justify-center rounded-full border text-fg outline-none backdrop-blur-md transition-transform duration-300 ease-[var(--ease-out-soft)] hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-accent/60 ${
            open ? "pointer-events-none" : ""
          }`}
          style={{
            background: `color-mix(in srgb, ${color} 18%, var(--surface))`,
            borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
            boxShadow: `0 10px 30px -12px color-mix(in srgb, ${color} 60%, transparent)`,
          }}
        >
          <ThreadDashboard name={thread.name} color={color} summary={summary} />
        </button>
        {!open && (
          <div className="nodrag absolute right-3 top-3">
            <CardMenu {...threadMenu} />
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="close"
            className="absolute left-1/2 top-1/2"
            style={{
              width: CENTER_RADIUS * 2,
              height: CENTER_RADIUS * 2,
              marginLeft: -CENTER_RADIUS,
              marginTop: -CENTER_RADIUS,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={transition}
          >
            <button
              type="button"
              aria-label={`Close ${thread.name}`}
              {...closeLongPress.handlers}
              onClick={() => {
                if (closeLongPress.consumeLongPress()) return;
                data.onToggle();
              }}
              className="flex h-full w-full items-center justify-center rounded-full border bg-surface text-fg outline-none transition-transform duration-200 hover:scale-110 focus-visible:ring-2 focus-visible:ring-accent/60"
              style={{ borderColor: `color-mix(in srgb, ${color} 60%, transparent)` }}
            >
              <X size={18} strokeWidth={2.4} />
            </button>
            {closeMenuOpen && (
              <div className="nodrag absolute left-full top-0">
                <CardMenu {...threadMenu} hideTrigger open onOpenChange={setCloseMenuOpen} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open &&
          layout.bubbles.map((b, i) => {
            const task = tasksById.get(b.id);
            if (b.id !== ADD_SLOT_ID && !task) return null;
            return (
              <motion.div
                key={b.id}
                className="nodrag absolute left-1/2 top-1/2"
                style={{ marginLeft: -b.r, marginTop: -b.r }}
                initial={reduced ? { x: b.x, y: b.y, opacity: 0 } : { x: 0, y: 0, scale: 0, opacity: 0 }}
                animate={{
                  x: b.x,
                  y: b.y,
                  scale: 1,
                  opacity: 1,
                  transition: { ...transition, delay: reduced ? 0 : Math.min(i * 0.025, 0.3) },
                }}
                exit={
                  reduced
                    ? { opacity: 0, transition }
                    : {
                        x: 0,
                        y: 0,
                        scale: 0,
                        opacity: 0,
                        transition: { ...transition, delay: Math.min((count - i) * 0.015, 0.2) },
                      }
                }
              >
                {b.id === ADD_SLOT_ID ? (
                  <NewTaskButton
                    threadId={thread.id}
                    threadName={thread.name}
                    onCreate={data.onCreateTask}
                    renderTrigger={(openDialog) => (
                      <button
                        type="button"
                        aria-label={`Add task to ${thread.name}`}
                        onClick={openDialog}
                        className="flex items-center justify-center rounded-full border border-dashed text-fg/60 outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/60"
                        style={{
                          width: b.r * 2,
                          height: b.r * 2,
                          borderColor: `color-mix(in srgb, ${color} 60%, transparent)`,
                        }}
                      >
                        <Plus size={16} />
                      </button>
                    )}
                  />
                ) : (
                  <TaskBubble
                    task={task!}
                    r={b.r}
                    color={color}
                    compact={b.ring >= 2}
                    onOpen={() => data.onOpenTask(b.id)}
                    onRename={() => data.onRenameTask(b.id)}
                    onMoveToThread={() => data.onMoveTask(b.id)}
                    onLinkSecondaryThread={() => data.onLinkTask(b.id)}
                    onDelete={() => data.onDeleteTask(b.id)}
                  />
                )}
              </motion.div>
            );
          })}
      </AnimatePresence>
    </motion.div>
  );
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run tests/component/ThreadClusterNode.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/canvas/ThreadClusterNode.tsx tests/component/ThreadClusterNode.test.tsx
git commit -m "Add ThreadClusterNode: continuous bloom between thread dashboard and task cluster

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Wire the bubble canvas into Canvas and the page, and remove the zoom tiers

**Files:**
- Modify: `components/canvas/Canvas.tsx`
- Modify: `app/(app)/canvas/page.tsx`
- Modify: `components/canvas/layout.ts`, `tests/unit/layout.test.ts`
- Delete: `components/canvas/zoomTier.ts`, `components/canvas/TaskNode.tsx`, `components/canvas/ThreadBubbleNode.tsx`, `tests/unit/zoomTier.test.ts`, `tests/component/TaskNode.test.tsx`, `tests/component/ThreadBubbleNode.test.tsx`
- Test: `tests/component/Canvas.test.tsx` (rewrite the affected blocks)

**Interfaces:**
- Consumes: `ThreadClusterNode`, `ThreadClusterData`, `clusterLayout`, `defaultThreadPosition`, `clustersOverlap`, `cameraZoomForCluster`, `COLLAPSED_DIAMETER`, `useOpenThreads`, `saveThreadPosition`.
- Produces: `Canvas` props become `{ threads; tasks; threadPositions: Record<string, {x:number;y:number}>; userId: string; initialJarvisSessions }`. The `positions` and `initialTier` props are removed.

- [ ] **Step 1: Update the Canvas tests first (failing)**

In `tests/component/Canvas.test.tsx`:

1. Replace `vi.mock("@/app/actions/taskPositions", () => ({ saveTaskPosition: vi.fn() }));` with:
   ```ts
   vi.mock("@/app/actions/threadPositions", () => ({ saveThreadPosition: vi.fn(async () => undefined) }));
   ```
2. Change `const defaultThemeProps = { initialJarvisSessions: [] };` to:
   ```ts
   const defaultThemeProps = { initialJarvisSessions: [], threadPositions: {}, userId: "u1" };
   ```
3. In `beforeEach`, change `vi.mocked(openThreadAndMaybeGetCatchUp).mockReset();` to:
   ```ts
   vi.mocked(openThreadAndMaybeGetCatchUp).mockReset().mockResolvedValue({ showCatchUp: false, summary: null });
   window.localStorage.clear();
   ```
4. Move the `ownerThread` and `editorThread` constants up so they sit directly below `const task = {…}`.
5. Everywhere, delete ` positions={{}}` and every `initialTier="BUBBLE"` line.
6. Add this helper below `defaultThemeProps`:
   ```ts
   const openThreadBubble = (name = "Q3 Report") =>
     fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${name} — .*Open thread$`) }));
   ```
7. In both "task edit race condition" tests, change `render(<Canvas threads={[]} tasks={[task]} … />)` to `render(<Canvas threads={[ownerThread]} tasks={[task]} {...defaultThemeProps} />)`, and add `openThreadBubble();` right after `render(...)`. The existing `fireEvent.click(screen.getByText("Original title"))` then clicks the title inside the task bubble, which bubbles up to its button. In the second test, after the panel closes, `screen.getByText("Edited title")` likewise targets the bubble's title span.
8. In the "thread catch-up" describe, replace each `fireEvent.click(screen.getByTestId("rf__node-th1"));` with `openThreadBubble();`.
9. Rename `describe("Canvas — thread bubble menu (BUBBLE tier)"` to `describe("Canvas — thread bubble menu"`. The `card-menu-trigger-area` lookups keep working because a closed thread renders exactly one `CardMenu`.
10. In both "AI priority suggestion" tests, `getByRole("button", { name: "New task" })` still resolves to the ThreadsPanel button (the cluster's add slot is named "Add task to Q3 Report"), so nothing changes there.
11. Append these new tests at the end of the file:

```tsx
describe("Canvas — bubble clusters", () => {
  it("opens a thread into its task bubbles and closes it again with the ×", async () => {
    render(<Canvas threads={[ownerThread]} tasks={[task]} {...defaultThemeProps} />);
    expect(screen.queryByRole("button", { name: /^Original title/ })).not.toBeInTheDocument();

    openThreadBubble();
    expect(await screen.findByRole("button", { name: "Original title, medium priority" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close Q3 Report" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^Original title/ })).not.toBeInTheDocument()
    );
  });

  it("closes the most recently opened thread on Escape", async () => {
    render(<Canvas threads={[ownerThread]} tasks={[task]} {...defaultThemeProps} />);
    openThreadBubble();
    await screen.findByRole("button", { name: "Close Q3 Report" });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Close Q3 Report" })).not.toBeInTheDocument());
  });

  it("restores open threads from localStorage for the same user", async () => {
    window.localStorage.setItem("arc.openThreads.u1", JSON.stringify(["th1"]));
    render(<Canvas threads={[ownerThread]} tasks={[task]} {...defaultThemeProps} />);
    expect(await screen.findByRole("button", { name: "Close Q3 Report" })).toBeInTheDocument();
  });

  it("opens the thread when a task is created in it from the threads panel", async () => {
    vi.mocked(createTask).mockResolvedValue({ id: "new-task-id" } as unknown as Awaited<ReturnType<typeof createTask>>);
    vi.mocked(suggestTaskPriority).mockResolvedValue({
      id: "new-task-id",
      priority: "MEDIUM",
      priorityIsAiSuggested: true,
    } as unknown as Awaited<ReturnType<typeof suggestTaskPriority>>);
    render(<Canvas threads={[ownerThread]} tasks={[]} {...defaultThemeProps} />);
    fireEvent.click(screen.getByRole("button", { name: "New task" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Fresh" } });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));
    expect(await screen.findByRole("button", { name: "Close Q3 Report" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the Canvas tests to see them fail**

Run: `npx vitest run tests/component/Canvas.test.tsx`
Expected: FAIL. Canvas has no `userId`/`threadPositions` support and no cluster buttons yet.

- [ ] **Step 3: Update the imports and node types in `Canvas.tsx`**

Replace the import block from `import { useCallback, useEffect, useMemo, useState } from "react";` through `import { computeThreadCentroid, … } from "./layout";`, plus the `TaskNode`/`ThreadBubbleNode` imports and `const nodeTypes = …`, with:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  ControlButton,
  useReactFlow,
  useStoreApi,
  ReactFlowProvider,
  applyNodeChanges,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useReducedMotion } from "framer-motion";
import ThreadClusterNode, { type ThreadClusterData } from "./ThreadClusterNode";
import { clusterLayout, type ClusterLayout } from "./clusterLayout";
import { COLLAPSED_DIAMETER, cameraZoomForCluster, clustersOverlap, defaultThreadPosition } from "./threadLayout";
import { useOpenThreads } from "./useOpenThreads";
```

Then:
- Change the lucide import to `import { LayoutGrid, List, Maximize, Minus, Plus } from "lucide-react";`
- Replace `import { saveTaskPosition } from "@/app/actions/taskPositions";` with `import { saveThreadPosition } from "@/app/actions/threadPositions";`
- Leave the Jarvis rendering alone in this task. Task 9 adds `JarvisLauncherTransition` and the other framer-motion imports (`AnimatePresence`, `LayoutGroup`, `motion`).
- Set `const nodeTypes = { threadCluster: ThreadClusterNode };`

- [ ] **Step 4: Update the props and state**

Change the `CanvasInner` signature and props type to:

```ts
function CanvasInner({
  threads,
  tasks,
  threadPositions,
  userId,
  initialJarvisSessions,
}: {
  threads: ThreadSummary[];
  tasks: TaskSummary[];
  threadPositions: PositionMap;
  userId: string;
  initialJarvisSessions: JarvisSessionSummary[];
}) {
  const { getZoom, setCenter, fitView, zoomIn, zoomOut } = useReactFlow();
  const store = useStoreApi();
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const openThreads = useOpenThreads(userId);
  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null);
  // Positions of threads dragged this session. Overlaid on the server's
  // threadPositions, which don't refresh after a drag, so re-deriving the
  // nodes (opening a thread, hovering) never snaps a thread back.
  const [draggedPositions, setDraggedPositions] = useState<PositionMap>({});
  // Timestamp of the last drag end, used to ignore the click that some
  // browsers deliver at the end of a drag.
  const lastDragEndRef = useRef(0);
```

Delete the `const [tier, setTier] = useState<…>(initialTier ?? "CARD");` line. Change `const [mobileView, setMobileView] = useState<"list" | "canvas">("list");` to `useState<"list" | "canvas">("canvas")`, and update the comment above it to: `// Phones default to the bubble canvas (tap-friendly, no dragging needed), with a toggle to the thread-grouped list.`

- [ ] **Step 5: Replace the position, count and node derivation**

Delete the whole `effectivePositions` `useMemo` and the whole `nodes` `useMemo` (from `const effectivePositions = useMemo<PositionMap>(() => {` through the closing `]);` of `nodes`). Keep `taskCounts`. Put this in their place:

```ts
  const effectiveThreadPositions = useMemo<PositionMap>(() => {
    const result: PositionMap = {};
    threads.forEach((thread, index) => {
      result[thread.id] = draggedPositions[thread.id] ?? threadPositions[thread.id] ?? defaultThreadPosition(index);
    });
    return result;
  }, [threads, threadPositions, draggedPositions]);

  const tasksByThread = useMemo(() => {
    const map = new Map<string, TaskSummary[]>();
    for (const task of tasks) {
      const list = map.get(task.primaryThreadId) ?? [];
      list.push(withOverride(task));
      map.set(task.primaryThreadId, list);
    }
    return map;
  }, [tasks, withOverride]);

  const layouts = useMemo(() => {
    const map = new Map<string, ClusterLayout>();
    for (const thread of threads) {
      map.set(
        thread.id,
        clusterLayout(tasksByThread.get(thread.id) ?? [], { includeAddSlot: thread.role !== "VIEWER" })
      );
    }
    return map;
  }, [threads, tasksByThread]);

  // Glides the camera to frame a thread's open cluster (pans only if it
  // already fits at a readable zoom).
  const focusCluster = useCallback(
    (threadId: string) => {
      const position = effectiveThreadPositions[threadId];
      const layout = layouts.get(threadId);
      if (!position || !layout) return;
      const { width, height } = store.getState();
      const zoom = cameraZoomForCluster(getZoom(), { width, height }, layout.radius, isMobile ? 12 : 48);
      void setCenter(position.x, position.y, { zoom, duration: reducedMotion ? 0 : 500 });
    },
    [effectiveThreadPositions, layouts, store, getZoom, setCenter, isMobile, reducedMotion]
  );

  const handleToggleThread = useCallback(
    (threadId: string) => {
      if (Date.now() - lastDragEndRef.current < 200) return;
      if (openThreads.isOpen(threadId)) {
        openThreads.close(threadId);
        return;
      }
      openThreads.open(threadId);
      focusCluster(threadId);
      void handleThreadBubbleClick(threadId);
    },
    [openThreads, focusCluster, handleThreadBubbleClick]
  );

  const nodes = useMemo<Node[]>(() => {
    const hoveredOpen =
      hoveredThreadId && openThreads.isOpen(hoveredThreadId) ? hoveredThreadId : null;
    const hoveredCircle = hoveredOpen
      ? {
          ...effectiveThreadPositions[hoveredOpen],
          r: (layouts.get(hoveredOpen)?.radius ?? 0) + 16,
        }
      : null;
    return threads.map((thread) => {
      const open = openThreads.isOpen(thread.id);
      const position = effectiveThreadPositions[thread.id];
      const dimmed =
        !open &&
        hoveredCircle !== null &&
        clustersOverlap(hoveredCircle, { ...position, r: COLLAPSED_DIAMETER / 2 });
      const data: ThreadClusterData = {
        thread: { id: thread.id, name: thread.name, categoryColor: thread.categoryColor },
        tasks: tasksByThread.get(thread.id) ?? [],
        layout: layouts.get(thread.id)!,
        open,
        dimmed,
        // lib/permissions.ts: canManageThreadMeta is OWNER+EDITOR,
        // canCloseOrDeleteThread is OWNER only, canManageTasks OWNER+EDITOR.
        canEditMeta: thread.role === "OWNER" || thread.role === "EDITOR",
        canCloseOrDelete: thread.role === "OWNER",
        canEditTasks: thread.role !== "VIEWER",
        onToggle: () => handleToggleThread(thread.id),
        onHoverChange: (hovered) =>
          setHoveredThreadId((current) => (hovered ? thread.id : current === thread.id ? null : current)),
        onOpenTask: (taskId) => void openTask(taskId),
        onRenameTask: (taskId) => void openTask(taskId),
        onMoveTask: (taskId) => void handleMoveToThread(taskId),
        onLinkTask: (taskId) => void handleLinkSecondaryThread(taskId),
        onDeleteTask: (taskId) => void handleDeleteTask(taskId),
        onRename: () => void handleRenameThread(thread.id),
        onChangeColor: () => void handleChangeThreadColor(thread.id),
        onCloseThread: () => void handleCloseThread(thread.id),
        onDeleteThread: () => void handleDeleteThread(thread.id),
        onViewCatchUp: () => void handleViewStoredCatchUp(thread.id),
        onCreateTask: (input) => void handleCreateTask(thread.id, input),
      };
      return {
        id: thread.id,
        type: "threadCluster",
        position,
        zIndex: open ? (hoveredThreadId === thread.id ? 20 : 10) : 0,
        data,
      };
    });
  }, [
    threads,
    tasksByThread,
    layouts,
    effectiveThreadPositions,
    openThreads,
    hoveredThreadId,
    handleToggleThread,
    openTask,
    handleMoveToThread,
    handleLinkSecondaryThread,
    handleDeleteTask,
    handleRenameThread,
    handleChangeThreadColor,
    handleCloseThread,
    handleDeleteThread,
    handleViewStoredCatchUp,
    handleCreateTask,
  ]);
```

**Ordering:** `nodes` and `handleToggleThread` reference `handleThreadBubbleClick` and `handleCreateTask`, so move the `handleCreateTask` `useCallback` (currently defined after `handleNodeClick`) above this block. `handleThreadBubbleClick` is already defined earlier.

- [ ] **Step 6: Replace the resync effect and the drag and click handlers**

Replace the resync `useEffect` (the one with the `// eslint-disable-next-line react-hooks/exhaustive-deps` and deps `[tier, threads, tasks, effectivePositions, taskEditOverrides]`) with:

```ts
  const [localNodes, setLocalNodes] = useState<Node[]>(nodes);
  useEffect(() => {
    // Keep whatever position React Flow has for a node mid-drag; otherwise
    // a re-derive (hover, open) during a drag would snap it back.
    setLocalNodes((current) => {
      const byId = new Map(current.map((n) => [n.id, n]));
      return nodes.map((n) => {
        const existing = byId.get(n.id);
        return existing?.dragging ? { ...n, position: existing.position, dragging: true } : n;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, tasks, effectiveThreadPositions, taskEditOverrides, openThreads.openIds, hoveredThreadId, layouts]);
```

Keep the explanatory comment block above it. Update the reference in it from `(tier/threads/tasks/positions/taskEditOverrides)` to `(threads/tasks/positions/open threads/hover)`.

Delete `handleMoveEnd` and `handleNodeClick`. Replace `handleNodeDragStop` with:

```ts
  const handleNodeDragStop = useCallback((_: unknown, node: Node) => {
    lastDragEndRef.current = Date.now();
    setDraggedPositions((prev) => ({ ...prev, [node.id]: node.position }));
    // Best effort, like task positions were: a failed save just means the
    // thread returns to its last saved spot on the next load.
    void saveThreadPosition(node.id, node.position.x, node.position.y).catch(() => {});
  }, []);
```

- [ ] **Step 7: Open the thread when a task is created, and update focus-thread**

In `handleCreateTask`, add `openThreads.open(threadId);` as the first line inside the callback body and add `openThreads` to its dependency array (`[router, openThreads]`).

Replace `handleFocusThread` with:

```ts
  // Clicking a thread in the threads panel opens its cluster and glides
  // the camera to it (after a frame, in case the canvas just mounted from
  // the phone list view).
  const handleFocusThread = useCallback(
    (threadId: string) => {
      setMobileView("canvas");
      openThreads.open(threadId);
      window.setTimeout(() => focusCluster(threadId), 60);
    },
    [openThreads, focusCluster]
  );
```

- [ ] **Step 8: Close the newest cluster with Escape**

Directly after the existing "J" shortcut `useEffect`, add:

```ts
  // Esc closes the most recently opened cluster — same guards as "J", and
  // not while Jarvis (which has its own Esc handling) is open.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || jarvisWorkspaceOpen) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      openThreads.closeMostRecent();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [jarvisWorkspaceOpen, openThreads]);
```

- [ ] **Step 9: Update the `<ReactFlow>` element**

Replace the `<ReactFlow …>…</ReactFlow>` element with:

```tsx
          <ReactFlow
            nodes={localNodes}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onNodeDragStop={handleNodeDragStop}
            // Node positions are thread centres, so a cluster grows evenly
            // around its thread when it opens.
            nodeOrigin={[0.5, 0.5]}
            minZoom={0.2}
            maxZoom={2}
            fitView
            fitViewOptions={{ padding: 0.3, maxZoom: 1.1 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
            {/* Custom buttons so zoom steps animate instead of jumping. */}
            <Controls position="bottom-left" showZoom={false} showFitView={false} showInteractive={false}>
              <ControlButton aria-label="Zoom In" title="Zoom in" onClick={() => void zoomIn({ duration: reducedMotion ? 0 : 300 })}>
                <Plus />
              </ControlButton>
              <ControlButton aria-label="Zoom Out" title="Zoom out" onClick={() => void zoomOut({ duration: reducedMotion ? 0 : 300 })}>
                <Minus />
              </ControlButton>
              <ControlButton
                aria-label="Fit View"
                title="Fit view"
                onClick={() => void fitView({ padding: 0.3, maxZoom: 1.1, duration: reducedMotion ? 0 : 300 })}
              >
                <Maximize />
              </ControlButton>
            </Controls>
          </ReactFlow>
```

Delete the now-unused `ZOOM_TIER_THRESHOLD` reference and the old phone `minZoom` comment.

- [ ] **Step 10: Update the default export**

Replace the `Canvas` default export's props type with:

```ts
export default function Canvas(props: {
  threads: ThreadSummary[];
  tasks: TaskSummary[];
  // Per-user saved thread-bubble centres; threads without one fall back to
  // a default grid (threadLayout.ts).
  threadPositions: PositionMap;
  // Scopes the remembered open/closed thread state in localStorage.
  userId: string;
  initialJarvisSessions: JarvisSessionSummary[];
}) {
```

- [ ] **Step 11: Update the page**

In `app/(app)/canvas/page.tsx`, replace the `taskPositions`/`positions` block with:

```ts
  const threadPositionRows = await db.threadPosition.findMany({
    where: { threadId: { in: threads.map((t) => t.id) }, userId },
  });
  const threadPositions = Object.fromEntries(
    threadPositionRows.map((p) => [p.threadId, { x: p.positionX, y: p.positionY }])
  );
```

In the JSX, replace `positions={positions}` with:

```tsx
      threadPositions={threadPositions}
      userId={userId}
```

- [ ] **Step 12: Delete the replaced files and trim `layout.ts`**

```bash
git rm components/canvas/zoomTier.ts components/canvas/TaskNode.tsx components/canvas/ThreadBubbleNode.tsx tests/unit/zoomTier.test.ts tests/component/TaskNode.test.tsx tests/component/ThreadBubbleNode.test.tsx
```

In `components/canvas/layout.ts`, delete the `computeThreadCentroid` function, and update the comment that mentions "TaskNode cards (and, at the BUBBLE tier, the thread centroid they feed)" to read "seeded TaskPosition rows". In `tests/unit/layout.test.ts`, remove `computeThreadCentroid` from the import and delete its `describe`/`it` blocks.

- [ ] **Step 13: Typecheck, lint and run the affected tests**

Run: `npx tsc --noEmit`
Expected: no errors. If `grep -rn "zoomTier\|TaskNode\|ThreadBubbleNode\|computeThreadCentroid" components app tests/unit tests/component` still finds imports, fix them.

Run: `npx eslint components/canvas app/\(app\)/canvas`
Expected: no errors.

Run: `npx vitest run tests/component/Canvas.test.tsx tests/unit/layout.test.ts tests/component/TaskListView.test.tsx`
Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add -A components/canvas app/\(app\)/canvas tests/component/Canvas.test.tsx tests/unit/layout.test.ts
git commit -m "Replace zoom-tier canvas with click-to-bloom thread clusters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Jarvis launch transition

**Files:**
- Create: `components/jarvis/JarvisLauncherTransition.tsx`
- Modify: `components/jarvis/JarvisPanel.tsx`, `components/jarvis/JarvisChat.tsx:103`, `components/canvas/Canvas.tsx`
- Test: `tests/component/JarvisLauncherTransition.test.tsx`, `tests/component/JarvisPanel.test.tsx` (append), `tests/component/Canvas.test.tsx` (append)

**Interfaces:**
- Produces:
  ```ts
  type LauncherOrigin = { x: number; y: number }; // viewport px, centre of the launcher
  // <JarvisLauncherTransition origin={LauncherOrigin | null}>{workspace}</JarvisLauncherTransition>
  // Must be a direct child of <AnimatePresence> (needs a key) for the exit animation.
  // JarvisPanel: new optional prop buttonRef?: React.Ref<HTMLButtonElement>
  // Shared layoutId "jarvis-orb" on the launcher orb and the JarvisChat header orb.
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/component/JarvisLauncherTransition.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AnimatePresence } from "framer-motion";
import JarvisLauncherTransition from "@/components/jarvis/JarvisLauncherTransition";

function Harness({ open }: { open: boolean }) {
  return (
    <AnimatePresence>
      {open && (
        <JarvisLauncherTransition key="jarvis" origin={{ x: 900, y: 700 }}>
          <div>Workspace content</div>
        </JarvisLauncherTransition>
      )}
    </AnimatePresence>
  );
}

describe("JarvisLauncherTransition", () => {
  it("reveals its children from the launcher origin and removes them after closing", async () => {
    const { rerender } = render(<Harness open />);
    expect(screen.getByText("Workspace content")).toBeInTheDocument();
    // jsdom's CSSStyleDeclaration drops clip-path, so the origin is also
    // exposed as a data attribute for this check.
    expect(screen.getByTestId("jarvis-launch-transition")).toHaveAttribute("data-origin", "900px 700px");

    rerender(<Harness open={false} />);
    await waitFor(() => expect(screen.queryByText("Workspace content")).not.toBeInTheDocument());
  });
});
```

Append to `tests/component/JarvisPanel.test.tsx` (add `createRef` from `react` to the imports):

```tsx
  it("forwards buttonRef to the launcher button", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<JarvisPanel onOpen={() => {}} buttonRef={ref} />);
    expect(ref.current).toBe(screen.getByRole("button", { name: "Jarvis" }));
  });
```

(Put it inside the existing `describe("JarvisPanel", …)` block, before its closing `});`.)

Append to `tests/component/Canvas.test.tsx`:

```tsx
describe("Canvas — Jarvis launch", () => {
  it("opens the workspace from the launcher and restores the launcher on close", async () => {
    render(<Canvas threads={[]} tasks={[]} {...defaultThemeProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Jarvis" }));
    expect(await screen.findByTestId("jarvis-launch-transition")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Jarvis" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/component/JarvisLauncherTransition.test.tsx tests/component/JarvisPanel.test.tsx tests/component/Canvas.test.tsx`
Expected: FAIL. The module is missing, `buttonRef` is ignored, and there's no transition test id.

- [ ] **Step 3: Implement the transition wrapper**

Create `components/jarvis/JarvisLauncherTransition.tsx`:

```tsx
"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export type LauncherOrigin = { x: number; y: number };

const LAUNCHER_RADIUS = 28;
const EASE = [0.22, 1, 0.36, 1] as const; // --ease-out-soft
const REVEAL_S = 0.45;

// Grows the Jarvis workspace out of the launcher button: a circular
// clip-path centred on the button expands to cover the viewport (and
// shrinks back into it on exit). A solid backdrop layer is revealed first,
// and the workspace content fades in over the last third so no text is
// visible while it's still being clipped. The launcher's orb and the chat
// header's orb share layoutId "jarvis-orb", so the orb itself flies between
// them. Must be a keyed direct child of <AnimatePresence>.
export default function JarvisLauncherTransition({
  origin,
  children,
}: {
  // Centre of the launcher in viewport pixels; null falls back to the
  // launcher's usual bottom-right corner.
  origin: LauncherOrigin | null;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const at = origin ? `${origin.x}px ${origin.y}px` : "calc(100% - 48px) calc(100% - 48px)";
  const full = typeof window === "undefined" ? 4000 : Math.ceil(Math.hypot(window.innerWidth, window.innerHeight));
  const closed = `circle(${LAUNCHER_RADIUS}px at ${at})`;
  const opened = `circle(${full}px at ${at})`;

  // pointer-events: the full-viewport wrapper must not swallow clicks
  // meant for the canvas strip; only the workspace itself is interactive.
  const wrapperClass = "pointer-events-none fixed inset-0 z-[110] [&>*]:pointer-events-auto";

  if (reduced) {
    return (
      <motion.div
        data-testid="jarvis-launch-transition"
        data-origin={at}
        className={wrapperClass}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      data-testid="jarvis-launch-transition"
      data-origin={at}
      className="pointer-events-none fixed inset-0 z-[110]"
      style={{ clipPath: closed }}
      initial={{ clipPath: closed }}
      animate={{ clipPath: opened }}
      exit={{ clipPath: closed }}
      transition={{ duration: REVEAL_S, ease: EASE }}
    >
      <div aria-hidden className="absolute inset-0 bg-canvas md:right-[max(38%,360px)]" />
      <motion.div
        className={wrapperClass}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: REVEAL_S * (2 / 3), duration: REVEAL_S / 3 } }}
        exit={{ opacity: 0, transition: { duration: 0.1 } }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
```

Note: the inline `style={{ clipPath: closed }}` makes the first paint start from the launcher. framer-motion then animates it.

- [ ] **Step 4: Add `buttonRef` and the shared orb to JarvisPanel**

In `components/jarvis/JarvisPanel.tsx`:
- Add imports `import type { Ref } from "react";` and `import { motion } from "framer-motion";`
- Add the `buttonRef` prop:
  ```ts
    shifted = false,
    buttonRef,
  }: {
    onOpen: () => void;
    // Moves the launcher left of the task-detail rail while that's open.
    shifted?: boolean;
    // Lets the canvas read the launcher's position so the Jarvis
    // workspace can grow out of it (also used by the "J" shortcut).
    buttonRef?: Ref<HTMLButtonElement>;
  }) {
  ```
- Add `ref={buttonRef}` to the `<button>`.
- Replace `<Orb state="breathing" size={36} />` with:
  ```tsx
      <motion.span layoutId="jarvis-orb" className="inline-flex">
        <Orb state="breathing" size={36} />
      </motion.span>
  ```

- [ ] **Step 5: Give the JarvisChat header orb the same `layoutId`**

In `components/jarvis/JarvisChat.tsx`, add `import { motion } from "framer-motion";` and wrap the header orb at line 103:

```tsx
          <motion.span layoutId="jarvis-orb" className="inline-flex">
            <Orb state={sending ? "working" : "breathing"} size={24} halo={false} />
          </motion.span>
```

- [ ] **Step 6: Wire it into Canvas**

In `components/canvas/Canvas.tsx`:
1. Add `import JarvisLauncherTransition, { type LauncherOrigin } from "@/components/jarvis/JarvisLauncherTransition";`, and change the framer-motion import to `import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";`
2. After the `jarvisWorkspaceOpen` state, add:

```ts
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const [jarvisOrigin, setJarvisOrigin] = useState<LauncherOrigin | null>(null);
  // Opens Jarvis from wherever the launcher currently is (it shifts left
  // while the task rail is open), for both the button and the "J" key.
  const openJarvis = useCallback(() => {
    const rect = launcherRef.current?.getBoundingClientRect();
    setJarvisOrigin(rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null);
    setJarvisWorkspaceOpen(true);
  }, []);
```

3. In the "J" shortcut effect, replace `setJarvisWorkspaceOpen(true);` with `openJarvis();` and give that effect the dependency array `[openJarvis]`.
4. Animate the canvas region into and out of its Jarvis strip. Change the region wrapper `<div className={jarvisWorkspaceOpen ? … : "absolute inset-0"}>` to a `motion.div` with the same `className`, plus:
   ```tsx
        layout
        transition={{ duration: reducedMotion ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
   ```
   Change the closing `</div>` to `</motion.div>` to match.
5. Replace the two Jarvis blocks at the bottom (`{!jarvisWorkspaceOpen && (<JarvisPanel … />)}` and `{jarvisWorkspaceOpen && (<JarvisWorkspace … />)}`) with:

```tsx
      <LayoutGroup>
        {!jarvisWorkspaceOpen && (
          // Slides left of the task-detail rail while it's open, so it no
          // longer sits on top of the rail's "Post update" button.
          <JarvisPanel
            buttonRef={launcherRef}
            onOpen={openJarvis}
            shifted={selectedTask !== null && !isMobile}
          />
        )}
        <AnimatePresence>
          {jarvisWorkspaceOpen && (
            <JarvisLauncherTransition key="jarvis" origin={jarvisOrigin}>
              <JarvisWorkspace
                initialSessions={initialJarvisSessions}
                onClose={() => setJarvisWorkspaceOpen(false)}
              />
            </JarvisLauncherTransition>
          )}
        </AnimatePresence>
      </LayoutGroup>
```

The launcher remounts as soon as closing starts, so its `layoutId` orb flies back from the chat header while the circle shrinks into it.

- [ ] **Step 7: Run the tests to see them pass**

Run: `npx vitest run tests/component/JarvisLauncherTransition.test.tsx tests/component/JarvisPanel.test.tsx tests/component/JarvisChat.test.tsx tests/component/JarvisWorkspace.test.tsx tests/component/Canvas.test.tsx`
Expected: PASS.

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit` → no errors.

```bash
git add components/jarvis components/canvas/Canvas.tsx tests/component/JarvisLauncherTransition.test.tsx tests/component/JarvisPanel.test.tsx tests/component/Canvas.test.tsx
git commit -m "Grow the Jarvis workspace out of its launcher button

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Update the e2e specs (don't run them)

**Files:**
- Modify: `tests/e2e/catchup-flow.spec.ts`, `tests/e2e/foundation-flow.spec.ts`, `tests/e2e/ai-prioritization-flow.spec.ts`

The thread name now appears both in the threads panel and on the collapsed bubble, so a bare `getByText("Q3 Report")` would violate Playwright's strict mode. Tasks are only visible inside an open cluster. Creating a task from the panel opens its thread automatically (Task 8), but a second user's canvas starts with every thread closed.

- [ ] **Step 1: catchup-flow.spec.ts**

1. Delete the `setZoomTier` helper and the long comment block about zoom tiers above it (lines ~23–55). Replace that comment with: `// Threads are bubbles that open on click (components/canvas/ThreadClusterNode.tsx); task bubbles only exist inside an open thread.`
2. Replace the two locator constants with:
   ```ts
   const threadNode = page.locator(".react-flow__node-threadCluster");
   const threadBubble = page.getByRole("button", { name: /^Q3 Report — .*Open thread$/ });
   const closeThread = page.getByRole("button", { name: "Close Q3 Report" });
   ```
3. In "create a thread", replace `await expect(page.getByText("Q3 Report")).toBeVisible();` with `await expect(threadBubble).toBeVisible();`
4. Make the body of "first-ever view…" this:
   ```ts
    await threadBubble.click();
    await expect(closeThread).toBeVisible();
    await expect(catchUpDialog).toHaveCount(0);
   ```
5. In "create a task in the thread", replace the `setZoomTier` line and the assertion after it with:
   ```ts
    await expect(page.getByRole("button", { name: /^Draft exec summary, / })).toBeVisible();
   ```
6. In 'manual "View catch-up"…', replace the `setZoomTier` call and the next two lines with:
   ```ts
    await closeThread.click();
    await expect(threadBubble).toBeVisible();
    await threadNode.getByRole("button", { name: "More actions" }).click();
    await threadNode.getByRole("menuitem", { name: "View catch-up" }).click();
   ```

- [ ] **Step 2: foundation-flow.spec.ts**

1. Replace each `await expect(page.getByText("Q3 Report")).toBeVisible();` with:
   ```ts
    await expect(page.getByRole("button", { name: /^Q3 Report — .*Open thread$/ })).toBeVisible();
   ```
2. In "viewer sees the shared thread and task…", replace `await expect(viewerPage.getByText("Q3 Report")).toBeVisible();` with:
   ```ts
    // A fresh viewer's canvas starts with every thread closed.
    await viewerPage.getByRole("button", { name: /^Q3 Report — .*Open thread$/ }).click();
   ```
   The following `getByText("Draft exec summary")` lines then match the task bubble's title.

- [ ] **Step 3: ai-prioritization-flow.spec.ts**

1. Replace `await expect(page.getByText("Q3 Report")).toBeVisible();` with the same `getByRole(..., /^Q3 Report — .*Open thread$/)` assertion used in Step 2.
2. Task bubbles don't show the AI badge (it lives in the detail panel). Merge the two badge steps into one:
   ```ts
  await test.step("the real AI suggestion lands and shows in the task detail panel", async () => {
    await page.getByText(taskTitle).click();
    await expect(taskDetailDialog).toBeVisible();
    // Fire-and-forget suggestion via a real Gemini call; generous timeout.
    await expect(taskDetailDialog.getByLabel("AI suggested")).toBeVisible({ timeout: 30000 });
  });
   ```
   Delete the old "badge appears on the canvas card" and "badge also shows in the task detail panel" steps. Leave the "manually changing priority…" step as it is.

- [ ] **Step 4: Typecheck the specs**

Run: `npx tsc --noEmit`
Expected: no errors. **Don't run `npm run test:e2e`.** Ask the user first, because it writes to the live DB.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e
git commit -m "Update e2e specs for click-to-open thread bubbles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Full check and browser verification

**Files:** none unless issues are found.

- [ ] **Step 1: Run the unit and component suites (never integration)**

Run: `npx vitest run tests/unit tests/component`
Expected: all PASS.

Run: `npx tsc --noEmit && npx eslint components app tests/unit tests/component`
Expected: no errors.

- [ ] **Step 2: Start the dev server in the preview**

Use the `preview_start` tool (create `.claude/launch.json` if it's missing, with `{"name":"dev","runtimeExecutable":"npm","runtimeArgs":["run","dev"],"port":3089}`). Never start it through Bash. Sign in with an existing account the user provides, or create a test account on localhost per the project's seed/fixture conventions.

- [ ] **Step 3: Desktop checks (read_page, screenshots, console)**

1. Threads render as dashboard bubbles with `!!!`/`!!`/`!` counts and a progress arc (where there are done tasks). There are no console errors.
2. Click a bubble. Tasks spring out, the × appears, and the camera glides. Click × halfway through opening: the animation reverses smoothly from where it is.
3. Wheel-zoom in and out across the full range. Nothing re-renders or swaps (there's no tier logic left).
4. Drag a thread (both closed and open), reload, and check its position persisted. Check that a drag doesn't also toggle the thread.
5. Right-click a task bubble and the ×. Menus open and actions work. "+" opens the New task dialog, and the created task pops in.
6. Esc closes the newest cluster.
7. Open Jarvis with the button and with "J". The circle grows from the button, the orb flies to the header, and the canvas strip slides right. Close it: the animation plays in reverse. If the `layout` animation on the canvas strip visibly distorts content, replace `layout` with a CSS `transition` on `width`/`left`, note it, and re-check.
8. Emulate reduced motion (`javascript_tool` can't toggle it, so check through the OS setting if the user wants, or skip and note it).

- [ ] **Step 4: Phone checks**

Use `resize_window` with preset `mobile` and reload. The canvas is the default view, the List/Canvas toggle works, tapping a bubble opens a cluster that fits the screen, and task taps open the bottom sheet. Reset with preset `desktop` afterward.

- [ ] **Step 5: Screenshot proof, then fix and commit anything found**

Take a screenshot of an open cluster on desktop and on mobile, and share them with the user. Commit any fixes with a descriptive message that ends with the Co-Authored-By line.
