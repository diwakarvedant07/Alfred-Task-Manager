# TODO App Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Foundation sub-project — email/password auth, a relational data model for threads/tasks/sharing, and a free-form zoomable canvas board with an "Arc Reactor HUD" visual theme (user-chosen accent color, light/dark toggle) — with no AI behavior yet.

**Architecture:** Single Next.js (App Router) app. Server Actions handle all mutations (no separate REST/API layer except one cron-triggered purge route). PostgreSQL via Prisma stores users, threads, tasks, and sharing relations with real foreign keys and a junction table for secondary thread links — no comma-separated ID columns anywhere. A `lib/permissions.ts` module is the single source of truth for who can do what; every Server Action calls into it server-side.

**Tech Stack:** Next.js 15 (App Router, TypeScript, Server Actions) · Tailwind CSS · PostgreSQL + Prisma 5 · Auth.js (next-auth v5) Credentials provider · @xyflow/react (React Flow) for the canvas · Framer Motion for animation · bcryptjs for password hashing · Vitest + Testing Library for unit/component tests · Playwright for end-to-end tests.

## Global Constraints

- Node.js 20+, npm as the package manager.
- TypeScript strict mode on for the whole project.
- PostgreSQL 16 via Docker Compose for local dev and test databases — no SQLite substitution (the schema relies on native enums).
- Every Server Action that mutates a Thread or Task **must** resolve the caller's role via `lib/permissions.ts` and enforce it server-side — never trust a client-supplied role or hide an action only in the UI.
- Soft-delete only: rows get `lifecycleStatus`/`status` set to `DELETED` plus `deletedAt`; hard deletes happen exclusively via the 30-day purge job or an explicit "Empty Recycle Bin" action.
- No hardcoded accent colors in component styles — always reference the `--accent` CSS custom property so the user's chosen color and the light/dark toggle both apply consistently.
- Every task in this plan ends with a passing test run and a commit before moving to the next task.

---

## File Structure

```
docker-compose.yml            # local Postgres for dev + test
.env.example
prisma/
  schema.prisma
lib/
  db.ts                       # Prisma client singleton
  auth.ts                     # Auth.js config (Credentials provider)
  permissions.ts              # ThreadRole resolution + capability checks
  theme.ts                    # themeToCssVariables()
  purge.ts                    # 30-day purge threshold + purge job
app/
  layout.tsx
  globals.css
  (auth)/
    signup/page.tsx
    login/page.tsx
  canvas/page.tsx
  recycle-bin/page.tsx
  api/
    auth/[...nextauth]/route.ts
    purge/route.ts
  actions/
    auth.ts
    threads.ts
    tasks.ts
    taskUpdates.ts
    threadShares.ts
    taskPositions.ts
    theme.ts
    recycleBin.ts
components/
  theme/ThemeProvider.tsx
  settings/AccentColorPicker.tsx
  settings/ThemeToggle.tsx
  canvas/Canvas.tsx
  canvas/TaskNode.tsx
  canvas/ThreadBubbleNode.tsx
  canvas/CardMenu.tsx
  canvas/zoomTier.ts
  canvas/layout.ts             # computeThreadCentroid()
  task-detail/TaskDetailPanel.tsx
  pwa/ServiceWorkerRegistration.tsx
public/
  manifest.json
  sw.js
tests/
  setupTests.ts
  helpers/resetDb.ts
  unit/
  integration/
  component/
  e2e/
```

Each Prisma model gets its own Server Action file; each Server Action file is the single place that both calls `lib/permissions.ts` and talks to `lib/db.ts` for that model. UI components under `components/` never import `lib/db.ts` directly — they only call Server Actions.

---

### Task 1: Project scaffold, tooling, and Postgres

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`, `postcss.config.js`, `.env.example`, `docker-compose.yml`, `vitest.config.ts`, `playwright.config.ts`, `tests/setupTests.ts`, `tests/unit/smoke.test.ts`

**Interfaces:**
- Produces: a working `npm run dev`, `npm test` (Vitest), `npm run test:e2e` (Playwright), and a running local Postgres on `localhost:5432` (db `tododb`, user `todo`, password `todo`).

- [ ] **Step 1: Scaffold Next.js**

```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir=false --import-alias "@/*" --use-npm --no-turbopack
```

- [ ] **Step 2: Install remaining dependencies**

```bash
npm install prisma @prisma/client next-auth@beta bcryptjs @xyflow/react framer-motion
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test @types/bcryptjs
```

- [ ] **Step 3: Add `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: todo
      POSTGRES_PASSWORD: todo
      POSTGRES_DB: tododb
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

- [ ] **Step 4: Add `.env.example`**

```bash
DATABASE_URL="postgresql://todo:todo@localhost:5432/tododb"
AUTH_SECRET="dev-only-change-me"
PURGE_SECRET="dev-only-change-me"
```

Copy it to `.env` for local development.

- [ ] **Step 5: Configure Vitest**

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setupTests.ts"],
    globals: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

`tests/setupTests.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:e2e": "playwright test"`.

- [ ] **Step 6: Configure Playwright**

```bash
npx playwright install --with-deps chromium
```

`playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
  use: { baseURL: "http://localhost:3000" },
});
```

- [ ] **Step 7: Write and run the smoke test**

`tests/unit/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("toolchain smoke test", () => {
  it("runs a basic assertion", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: PASS (1 test)

- [ ] **Step 8: Start Postgres and verify connectivity**

```bash
docker compose up -d
```

Run: `docker compose ps`
Expected: `postgres` service shows `Up`.

- [ ] **Step 9: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Next.js app with Vitest, Playwright, and Postgres"
```

---

### Task 2: Prisma schema and migrations

**Files:**
- Create: `prisma/schema.prisma`, `lib/db.ts`, `tests/helpers/resetDb.ts`, `tests/integration/schema.test.ts`

**Interfaces:**
- Consumes: `DATABASE_URL` from `.env` (Task 1).
- Produces: `db` (PrismaClient singleton, from `lib/db.ts`); Prisma models `User`, `Thread`, `Task`, `TaskThreadLink`, `TaskUpdate`, `TaskPosition`, `ThreadShare`; enums `ThemeMode`, `ThreadStatus`, `TaskWorkStatus`, `TaskPriority`, `TaskLifecycleStatus`, `SharePermission`; `resetDb()` from `tests/helpers/resetDb.ts` for use by every later integration test.

- [ ] **Step 1: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum ThemeMode {
  LIGHT
  DARK
}

enum ThreadStatus {
  ACTIVE
  ARCHIVED
  DELETED
}

enum TaskWorkStatus {
  TODO
  IN_PROGRESS
  DONE
}

enum TaskPriority {
  LOW
  MEDIUM
  HIGH
}

enum TaskLifecycleStatus {
  ACTIVE
  DELETED
}

enum SharePermission {
  VIEWER
  EDITOR
}

model User {
  id           String    @id @default(cuid())
  email        String    @unique
  passwordHash String
  name         String
  themeMode    ThemeMode @default(DARK)
  accentColor  String    @default("#38e0ff")
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  ownedThreads   Thread[]       @relation("ThreadOwner")
  taskUpdates    TaskUpdate[]
  taskPositions  TaskPosition[]
  sharesReceived ThreadShare[]  @relation("ShareRecipient")
}

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

  @@index([ownerId, status])
}

model Task {
  id              String              @id @default(cuid())
  primaryThreadId String
  primaryThread   Thread              @relation("PrimaryThread", fields: [primaryThreadId], references: [id])
  title           String
  description     String              @default("")
  workStatus      TaskWorkStatus      @default(TODO)
  priority        TaskPriority        @default(MEDIUM)
  dueDate         DateTime?
  lifecycleStatus TaskLifecycleStatus @default(ACTIVE)
  deletedAt       DateTime?
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  secondaryThreadLinks TaskThreadLink[]
  updates              TaskUpdate[]
  positions            TaskPosition[]

  @@index([primaryThreadId, lifecycleStatus])
}

model TaskThreadLink {
  taskId   String
  threadId String
  task     Task   @relation(fields: [taskId], references: [id])
  thread   Thread @relation(fields: [threadId], references: [id])

  @@id([taskId, threadId])
}

model TaskUpdate {
  id        String   @id @default(cuid())
  taskId    String
  task      Task     @relation(fields: [taskId], references: [id])
  authorId  String
  author    User     @relation(fields: [authorId], references: [id])
  body      String
  createdAt DateTime @default(now())

  @@index([taskId, createdAt])
}

model TaskPosition {
  taskId    String
  userId    String
  task      Task   @relation(fields: [taskId], references: [id])
  user      User   @relation(fields: [userId], references: [id])
  positionX Float
  positionY Float

  @@id([taskId, userId])
}

model ThreadShare {
  id               String          @id @default(cuid())
  threadId         String
  thread           Thread          @relation(fields: [threadId], references: [id])
  sharedWithUserId String
  sharedWithUser   User            @relation("ShareRecipient", fields: [sharedWithUserId], references: [id])
  permission       SharePermission
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt

  @@unique([threadId, sharedWithUserId])
}
```

- [ ] **Step 2: Run the initial migration**

```bash
npx prisma migrate dev --name init
```

Expected: migration applies cleanly, `@prisma/client` regenerates with no type errors.

- [ ] **Step 3: Write `lib/db.ts`**

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
```

- [ ] **Step 4: Write `tests/helpers/resetDb.ts`**

```ts
import { db } from "@/lib/db";

export async function resetDb() {
  await db.taskUpdate.deleteMany();
  await db.taskPosition.deleteMany();
  await db.taskThreadLink.deleteMany();
  await db.threadShare.deleteMany();
  await db.task.deleteMany();
  await db.thread.deleteMany();
  await db.user.deleteMany();
}
```

- [ ] **Step 5: Write the failing integration test**

`tests/integration/schema.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";

describe("Prisma schema", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  it("creates a user, thread, and task with a required primary thread FK", async () => {
    const user = await db.user.create({
      data: { email: "a@example.com", passwordHash: "x", name: "Ada" },
    });
    const thread = await db.thread.create({
      data: { ownerId: user.id, name: "Q3 Report", categoryColor: "#f2c14e" },
    });
    const task = await db.task.create({
      data: { primaryThreadId: thread.id, title: "Draft exec summary" },
    });

    expect(task.primaryThreadId).toBe(thread.id);
    expect(task.workStatus).toBe("TODO");
    expect(user.themeMode).toBe("DARK");
    expect(user.accentColor).toBe("#38e0ff");
  });

  it("supports many-to-many secondary thread links via a junction table", async () => {
    const user = await db.user.create({
      data: { email: "b@example.com", passwordHash: "x", name: "Bo" },
    });
    const primary = await db.thread.create({
      data: { ownerId: user.id, name: "Primary", categoryColor: "#38e0ff" },
    });
    const secondary = await db.thread.create({
      data: { ownerId: user.id, name: "Secondary", categoryColor: "#ff5fa8" },
    });
    const task = await db.task.create({
      data: { primaryThreadId: primary.id, title: "Cross-cutting task" },
    });

    await db.taskThreadLink.create({
      data: { taskId: task.id, threadId: secondary.id },
    });

    const links = await db.taskThreadLink.findMany({ where: { taskId: task.id } });
    expect(links).toHaveLength(1);
    expect(links[0].threadId).toBe(secondary.id);
  });
});
```

Run: `npm test -- schema.test.ts`
Expected: PASS (this step is verifying the schema, not a red/green cycle — it should pass immediately since the schema was already migrated in Step 2; if it fails, the schema has a bug to fix before continuing).

- [ ] **Step 6: Commit**

```bash
git add prisma lib/db.ts tests
git commit -m "feat: add Prisma schema and data-access foundation"
```

---

### Task 3: Permission model

**Files:**
- Create: `lib/permissions.ts`, `tests/unit/permissions.test.ts`

**Interfaces:**
- Consumes: nothing (pure module, no DB access).
- Produces: `type ThreadRole = "OWNER" | "EDITOR" | "VIEWER" | null`; `class PermissionError extends Error`; `resolveThreadRole(input: { ownerId: string; shares: { sharedWithUserId: string; permission: "VIEWER" | "EDITOR" }[]; userId: string }): ThreadRole`; `canViewThread(role: ThreadRole): boolean`; `canManageThreadMeta(role: ThreadRole): boolean`; `canCloseOrDeleteThread(role: ThreadRole): boolean`; `canManageTasks(role: ThreadRole): boolean`; `canComment(role: ThreadRole): boolean`; `canManageShares(role: ThreadRole): boolean`.

- [ ] **Step 1: Write the failing test**

`tests/unit/permissions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  resolveThreadRole,
  canViewThread,
  canManageThreadMeta,
  canCloseOrDeleteThread,
  canManageTasks,
  canComment,
  canManageShares,
} from "@/lib/permissions";

const OWNER_ID = "owner-1";
const EDITOR_ID = "editor-1";
const VIEWER_ID = "viewer-1";
const STRANGER_ID = "stranger-1";

const shares = [
  { sharedWithUserId: EDITOR_ID, permission: "EDITOR" as const },
  { sharedWithUserId: VIEWER_ID, permission: "VIEWER" as const },
];

describe("resolveThreadRole", () => {
  it("resolves OWNER, EDITOR, VIEWER, and null for a stranger", () => {
    expect(resolveThreadRole({ ownerId: OWNER_ID, shares, userId: OWNER_ID })).toBe("OWNER");
    expect(resolveThreadRole({ ownerId: OWNER_ID, shares, userId: EDITOR_ID })).toBe("EDITOR");
    expect(resolveThreadRole({ ownerId: OWNER_ID, shares, userId: VIEWER_ID })).toBe("VIEWER");
    expect(resolveThreadRole({ ownerId: OWNER_ID, shares, userId: STRANGER_ID })).toBeNull();
  });
});

describe("capability matrix", () => {
  const roles: ("OWNER" | "EDITOR" | "VIEWER" | null)[] = ["OWNER", "EDITOR", "VIEWER", null];

  it("canViewThread: everyone with a role, nobody without", () => {
    expect(roles.map(canViewThread)).toEqual([true, true, true, false]);
  });

  it("canManageThreadMeta (rename/change color): OWNER and EDITOR only", () => {
    expect(roles.map(canManageThreadMeta)).toEqual([true, true, false, false]);
  });

  it("canCloseOrDeleteThread: OWNER only", () => {
    expect(roles.map(canCloseOrDeleteThread)).toEqual([true, false, false, false]);
  });

  it("canManageTasks (create/edit/move/link/delete tasks): OWNER and EDITOR only", () => {
    expect(roles.map(canManageTasks)).toEqual([true, true, false, false]);
  });

  it("canComment: OWNER, EDITOR, and VIEWER", () => {
    expect(roles.map(canComment)).toEqual([true, true, true, false]);
  });

  it("canManageShares (invite/revoke collaborators): OWNER only", () => {
    expect(roles.map(canManageShares)).toEqual([true, false, false, false]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- permissions.test.ts`
Expected: FAIL with "Cannot find module '@/lib/permissions'"

- [ ] **Step 3: Write the implementation**

`lib/permissions.ts`:

```ts
export type ThreadRole = "OWNER" | "EDITOR" | "VIEWER" | null;

export class PermissionError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = "PermissionError";
  }
}

export function resolveThreadRole(input: {
  ownerId: string;
  shares: { sharedWithUserId: string; permission: "VIEWER" | "EDITOR" }[];
  userId: string;
}): ThreadRole {
  if (input.ownerId === input.userId) return "OWNER";
  const share = input.shares.find((s) => s.sharedWithUserId === input.userId);
  return share ? share.permission : null;
}

export function canViewThread(role: ThreadRole): boolean {
  return role !== null;
}

export function canManageThreadMeta(role: ThreadRole): boolean {
  return role === "OWNER" || role === "EDITOR";
}

export function canCloseOrDeleteThread(role: ThreadRole): boolean {
  return role === "OWNER";
}

export function canManageTasks(role: ThreadRole): boolean {
  return role === "OWNER" || role === "EDITOR";
}

export function canComment(role: ThreadRole): boolean {
  return role === "OWNER" || role === "EDITOR" || role === "VIEWER";
}

export function canManageShares(role: ThreadRole): boolean {
  return role === "OWNER";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- permissions.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/permissions.ts tests/unit/permissions.test.ts
git commit -m "feat: add thread role resolution and capability checks"
```

---

### Task 4: Auth — signup, login, session

**Files:**
- Create: `app/actions/auth.ts`, `lib/auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `app/(auth)/signup/page.tsx`, `app/(auth)/login/page.tsx`, `middleware.ts`, `tests/integration/auth.test.ts`

**Interfaces:**
- Consumes: `db` (Task 2).
- Produces: `signup(input: { email: string; password: string; name: string }): Promise<{ id: string; email: string }>`, `class SignupError extends Error`; `auth()`, `signIn`, `signOut`, `handlers` from `lib/auth.ts`.

- [ ] **Step 1: Write the failing test**

`tests/integration/auth.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { signup, SignupError } from "@/app/actions/auth";

describe("signup", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  it("creates a user with a hashed password", async () => {
    const result = await signup({ email: "New@Example.com", password: "correcthorse", name: "Nova" });
    const user = await db.user.findUnique({ where: { email: "new@example.com" } });

    expect(result.email).toBe("new@example.com");
    expect(user).not.toBeNull();
    expect(user!.passwordHash).not.toBe("correcthorse");
    expect(await bcrypt.compare("correcthorse", user!.passwordHash)).toBe(true);
  });

  it("rejects a duplicate email", async () => {
    await signup({ email: "dup@example.com", password: "correcthorse", name: "Dup" });
    await expect(
      signup({ email: "dup@example.com", password: "anotherpassword", name: "Dup2" })
    ).rejects.toThrow(SignupError);
  });

  it("rejects a password shorter than 8 characters", async () => {
    await expect(
      signup({ email: "short@example.com", password: "short", name: "Shorty" })
    ).rejects.toThrow(SignupError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- auth.test.ts`
Expected: FAIL with "Cannot find module '@/app/actions/auth'"

- [ ] **Step 3: Write `app/actions/auth.ts`**

```ts
"use server";

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export class SignupError extends Error {}

export async function signup(input: { email: string; password: string; name: string }) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  if (!email || !input.password || !name) {
    throw new SignupError("Email, password, and name are required.");
  }
  if (input.password.length < 8) {
    throw new SignupError("Password must be at least 8 characters.");
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    throw new SignupError("An account with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await db.user.create({ data: { email, passwordHash, name } });
  return { id: user.id, email: user.email };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- auth.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write `lib/auth.ts`**

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = (credentials?.email as string | undefined)?.trim().toLowerCase();
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await db.user.findUnique({ where: { email } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
});
```

- [ ] **Step 6: Write the route handler**

`app/api/auth/[...nextauth]/route.ts`:

```ts
export { GET, POST } from "@/lib/auth";
```

- [ ] **Step 7: Write `middleware.ts`**

```ts
export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: ["/canvas/:path*", "/recycle-bin/:path*"],
};
```

- [ ] **Step 8: Write signup and login pages**

`app/(auth)/signup/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { signup } from "@/app/actions/auth";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    try {
      await signup({
        email: String(formData.get("email")),
        password: String(formData.get("password")),
        name: String(formData.get("name")),
      });
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirect: false,
      });
      router.push("/canvas");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed.");
    }
  }

  return (
    <form action={handleSubmit} data-testid="signup-form">
      <input name="name" placeholder="Name" required />
      <input name="email" type="email" placeholder="Email" required />
      <input name="password" type="password" placeholder="Password" required />
      <button type="submit">Sign up</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

`app/(auth)/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    });
    if (result?.error) {
      setError("Invalid email or password.");
      return;
    }
    router.push("/canvas");
  }

  return (
    <form action={handleSubmit} data-testid="login-form">
      <input name="email" type="email" placeholder="Email" required />
      <input name="password" type="password" placeholder="Password" required />
      <button type="submit">Log in</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 9: Run full test suite**

Run: `npm test`
Expected: PASS (all prior tests plus the 3 new auth tests)

- [ ] **Step 10: Commit**

```bash
git add app/actions/auth.ts lib/auth.ts app/api/auth "app/(auth)" middleware.ts tests/integration/auth.test.ts
git commit -m "feat: add email/password signup, login, and session middleware"
```

---

### Task 5: Thread Server Actions

**Files:**
- Create: `app/actions/threads.ts`, `tests/integration/threads.test.ts`

**Interfaces:**
- Consumes: `db` (Task 2); `resolveThreadRole`, `canManageThreadMeta`, `canCloseOrDeleteThread`, `PermissionError` (Task 3); `auth()` (Task 4).
- Produces: `createThread(input: { name: string; categoryColor: string }): Promise<Thread>`; `renameThread(threadId: string, name: string): Promise<Thread>`; `changeThreadCategoryColor(threadId: string, categoryColor: string): Promise<Thread>`; `closeThread(threadId: string): Promise<Thread>`; `deleteThread(threadId: string): Promise<Thread>`.

- [ ] **Step 1: Write the failing test**

`tests/integration/threads.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import {
  createThread,
  renameThread,
  changeThreadCategoryColor,
  closeThread,
  deleteThread,
} from "@/app/actions/threads";
import { PermissionError } from "@/lib/permissions";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("thread actions", () => {
  let ownerId: string;
  let editorId: string;
  let viewerId: string;
  let strangerId: string;

  beforeEach(async () => {
    await resetDb();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const editor = await db.user.create({ data: { email: "editor@x.com", passwordHash: "x", name: "Editor" } });
    const viewer = await db.user.create({ data: { email: "viewer@x.com", passwordHash: "x", name: "Viewer" } });
    const stranger = await db.user.create({ data: { email: "stranger@x.com", passwordHash: "x", name: "Stranger" } });
    ownerId = owner.id;
    editorId = editor.id;
    viewerId = viewer.id;
    strangerId = stranger.id;
  });
  afterAll(async () => db.$disconnect());

  it("creates a thread owned by the caller", async () => {
    await loginAs(ownerId);
    const thread = await createThread({ name: "Q3 Report", categoryColor: "#f2c14e" });
    expect(thread.ownerId).toBe(ownerId);
    expect(thread.status).toBe("ACTIVE");
  });

  it("lets the owner and an editor rename and recolor a thread", async () => {
    await loginAs(ownerId);
    const thread = await createThread({ name: "Original", categoryColor: "#f2c14e" });
    await db.threadShare.create({
      data: { threadId: thread.id, sharedWithUserId: editorId, permission: "EDITOR" },
    });

    await loginAs(editorId);
    const renamed = await renameThread(thread.id, "Renamed by editor");
    expect(renamed.name).toBe("Renamed by editor");

    const recolored = await changeThreadCategoryColor(thread.id, "#38e0ff");
    expect(recolored.categoryColor).toBe("#38e0ff");
  });

  it("blocks a viewer from renaming a thread", async () => {
    await loginAs(ownerId);
    const thread = await createThread({ name: "Original", categoryColor: "#f2c14e" });
    await db.threadShare.create({
      data: { threadId: thread.id, sharedWithUserId: viewerId, permission: "VIEWER" },
    });

    await loginAs(viewerId);
    await expect(renameThread(thread.id, "Nope")).rejects.toThrow(PermissionError);
  });

  it("only lets the owner close or delete a thread, not an editor", async () => {
    await loginAs(ownerId);
    const thread = await createThread({ name: "Original", categoryColor: "#f2c14e" });
    await db.threadShare.create({
      data: { threadId: thread.id, sharedWithUserId: editorId, permission: "EDITOR" },
    });

    await loginAs(editorId);
    await expect(closeThread(thread.id)).rejects.toThrow(PermissionError);
    await expect(deleteThread(thread.id)).rejects.toThrow(PermissionError);

    await loginAs(ownerId);
    const closed = await closeThread(thread.id);
    expect(closed.status).toBe("ARCHIVED");
    const deleted = await deleteThread(thread.id);
    expect(deleted.status).toBe("DELETED");
    expect(deleted.deletedAt).not.toBeNull();
  });

  it("blocks a stranger with no share record entirely", async () => {
    await loginAs(ownerId);
    const thread = await createThread({ name: "Private", categoryColor: "#f2c14e" });

    await loginAs(strangerId);
    await expect(renameThread(thread.id, "Nope")).rejects.toThrow(PermissionError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- threads.test.ts`
Expected: FAIL with "Cannot find module '@/app/actions/threads'"

- [ ] **Step 3: Write the implementation**

`app/actions/threads.ts`:

```ts
"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  resolveThreadRole,
  canManageThreadMeta,
  canCloseOrDeleteThread,
  PermissionError,
} from "@/lib/permissions";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new PermissionError("You must be logged in.");
  return session.user.id;
}

async function requireRole(threadId: string, userId: string) {
  const thread = await db.thread.findUniqueOrThrow({
    where: { id: threadId },
    include: { shares: true },
  });
  const role = resolveThreadRole({
    ownerId: thread.ownerId,
    shares: thread.shares.map((s) => ({ sharedWithUserId: s.sharedWithUserId, permission: s.permission })),
    userId,
  });
  return { thread, role };
}

export async function createThread(input: { name: string; categoryColor: string }) {
  const userId = await requireUserId();
  return db.thread.create({
    data: { ownerId: userId, name: input.name, categoryColor: input.categoryColor },
  });
}

export async function renameThread(threadId: string, name: string) {
  const userId = await requireUserId();
  const { role } = await requireRole(threadId, userId);
  if (!canManageThreadMeta(role)) throw new PermissionError();
  return db.thread.update({ where: { id: threadId }, data: { name } });
}

export async function changeThreadCategoryColor(threadId: string, categoryColor: string) {
  const userId = await requireUserId();
  const { role } = await requireRole(threadId, userId);
  if (!canManageThreadMeta(role)) throw new PermissionError();
  return db.thread.update({ where: { id: threadId }, data: { categoryColor } });
}

export async function closeThread(threadId: string) {
  const userId = await requireUserId();
  const { role } = await requireRole(threadId, userId);
  if (!canCloseOrDeleteThread(role)) throw new PermissionError();
  return db.thread.update({ where: { id: threadId }, data: { status: "ARCHIVED" } });
}

export async function deleteThread(threadId: string) {
  const userId = await requireUserId();
  const { role } = await requireRole(threadId, userId);
  if (!canCloseOrDeleteThread(role)) throw new PermissionError();
  return db.thread.update({
    where: { id: threadId },
    data: { status: "DELETED", deletedAt: new Date() },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- threads.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add app/actions/threads.ts tests/integration/threads.test.ts
git commit -m "feat: add thread CRUD server actions with permission enforcement"
```

---

### Task 6: Task Server Actions

**Files:**
- Create: `app/actions/tasks.ts`, `tests/integration/tasks.test.ts`

**Interfaces:**
- Consumes: `db`, `auth()`, `resolveThreadRole`, `canManageTasks`, `PermissionError` (Tasks 2–4).
- Produces: `createTask(input: { primaryThreadId: string; title: string; description?: string; priority?: "LOW"|"MEDIUM"|"HIGH"; dueDate?: Date }): Promise<Task>`; `updateTask(taskId: string, patch: { title?: string; description?: string; workStatus?: "TODO"|"IN_PROGRESS"|"DONE"; priority?: "LOW"|"MEDIUM"|"HIGH"; dueDate?: Date | null }): Promise<Task>`; `moveTaskToThread(taskId: string, newThreadId: string): Promise<Task>`; `linkSecondaryThread(taskId: string, threadId: string): Promise<void>`; `unlinkSecondaryThread(taskId: string, threadId: string): Promise<void>`; `deleteTask(taskId: string): Promise<Task>`.

- [ ] **Step 1: Write the failing test**

`tests/integration/tasks.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { createThread } from "@/app/actions/threads";
import {
  createTask,
  updateTask,
  moveTaskToThread,
  linkSecondaryThread,
  unlinkSecondaryThread,
  deleteTask,
} from "@/app/actions/tasks";
import { PermissionError } from "@/lib/permissions";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("task actions", () => {
  let ownerId: string;
  let viewerId: string;
  let threadId: string;
  let secondThreadId: string;

  beforeEach(async () => {
    await resetDb();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const viewer = await db.user.create({ data: { email: "viewer@x.com", passwordHash: "x", name: "Viewer" } });
    ownerId = owner.id;
    viewerId = viewer.id;

    await loginAs(ownerId);
    const thread = await createThread({ name: "Primary", categoryColor: "#f2c14e" });
    const secondThread = await createThread({ name: "Secondary", categoryColor: "#6fb1e0" });
    threadId = thread.id;
    secondThreadId = secondThread.id;
    await db.threadShare.create({ data: { threadId, sharedWithUserId: viewerId, permission: "VIEWER" } });
  });
  afterAll(async () => db.$disconnect());

  it("creates a task with a required primary thread", async () => {
    await loginAs(ownerId);
    const task = await createTask({ primaryThreadId: threadId, title: "Draft summary" });
    expect(task.primaryThreadId).toBe(threadId);
    expect(task.workStatus).toBe("TODO");
    expect(task.priority).toBe("MEDIUM");
  });

  it("blocks a viewer from creating or editing tasks", async () => {
    await loginAs(ownerId);
    const task = await createTask({ primaryThreadId: threadId, title: "Owner task" });

    await loginAs(viewerId);
    await expect(createTask({ primaryThreadId: threadId, title: "Viewer task" })).rejects.toThrow(PermissionError);
    await expect(updateTask(task.id, { title: "Hacked" })).rejects.toThrow(PermissionError);
  });

  it("moves a task to a different primary thread", async () => {
    await loginAs(ownerId);
    const task = await createTask({ primaryThreadId: threadId, title: "Movable" });
    const moved = await moveTaskToThread(task.id, secondThreadId);
    expect(moved.primaryThreadId).toBe(secondThreadId);
  });

  it("links and unlinks a secondary thread without touching the primary", async () => {
    await loginAs(ownerId);
    const task = await createTask({ primaryThreadId: threadId, title: "Cross-cutting" });
    await linkSecondaryThread(task.id, secondThreadId);

    let links = await db.taskThreadLink.findMany({ where: { taskId: task.id } });
    expect(links.map((l) => l.threadId)).toEqual([secondThreadId]);

    await unlinkSecondaryThread(task.id, secondThreadId);
    links = await db.taskThreadLink.findMany({ where: { taskId: task.id } });
    expect(links).toHaveLength(0);
  });

  it("soft-deletes a task", async () => {
    await loginAs(ownerId);
    const task = await createTask({ primaryThreadId: threadId, title: "Doomed" });
    const deleted = await deleteTask(task.id);
    expect(deleted.lifecycleStatus).toBe("DELETED");
    expect(deleted.deletedAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tasks.test.ts`
Expected: FAIL with "Cannot find module '@/app/actions/tasks'"

- [ ] **Step 3: Write the implementation**

`app/actions/tasks.ts`:

```ts
"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { resolveThreadRole, canManageTasks, PermissionError } from "@/lib/permissions";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new PermissionError("You must be logged in.");
  return session.user.id;
}

async function requireTaskManageRole(threadId: string, userId: string) {
  const thread = await db.thread.findUniqueOrThrow({
    where: { id: threadId },
    include: { shares: true },
  });
  const role = resolveThreadRole({
    ownerId: thread.ownerId,
    shares: thread.shares.map((s) => ({ sharedWithUserId: s.sharedWithUserId, permission: s.permission })),
    userId,
  });
  if (!canManageTasks(role)) throw new PermissionError();
}

export async function createTask(input: {
  primaryThreadId: string;
  title: string;
  description?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH";
  dueDate?: Date;
}) {
  const userId = await requireUserId();
  await requireTaskManageRole(input.primaryThreadId, userId);
  return db.task.create({
    data: {
      primaryThreadId: input.primaryThreadId,
      title: input.title,
      description: input.description ?? "",
      priority: input.priority ?? "MEDIUM",
      dueDate: input.dueDate,
    },
  });
}

async function loadTaskWithThreadRole(taskId: string, userId: string) {
  const task = await db.task.findUniqueOrThrow({ where: { id: taskId } });
  await requireTaskManageRole(task.primaryThreadId, userId);
  return task;
}

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
  return db.task.update({ where: { id: taskId }, data: patch });
}

export async function moveTaskToThread(taskId: string, newThreadId: string) {
  const userId = await requireUserId();
  await loadTaskWithThreadRole(taskId, userId);
  await requireTaskManageRole(newThreadId, userId);
  return db.task.update({ where: { id: taskId }, data: { primaryThreadId: newThreadId } });
}

export async function linkSecondaryThread(taskId: string, threadId: string) {
  const userId = await requireUserId();
  await loadTaskWithThreadRole(taskId, userId);
  await requireTaskManageRole(threadId, userId);
  await db.taskThreadLink.create({ data: { taskId, threadId } });
}

export async function unlinkSecondaryThread(taskId: string, threadId: string) {
  const userId = await requireUserId();
  await loadTaskWithThreadRole(taskId, userId);
  await db.taskThreadLink.delete({ where: { taskId_threadId: { taskId, threadId } } });
}

export async function deleteTask(taskId: string) {
  const userId = await requireUserId();
  await loadTaskWithThreadRole(taskId, userId);
  return db.task.update({
    where: { id: taskId },
    data: { lifecycleStatus: "DELETED", deletedAt: new Date() },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tasks.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add app/actions/tasks.ts tests/integration/tasks.test.ts
git commit -m "feat: add task CRUD, move, and secondary thread link server actions"
```

---

### Task 7: Task comments (TaskUpdate)

**Files:**
- Create: `app/actions/taskUpdates.ts`, `tests/integration/taskUpdates.test.ts`

**Interfaces:**
- Consumes: `db`, `auth()`, `resolveThreadRole`, `canComment`, `PermissionError`.
- Produces: `addTaskUpdate(taskId: string, body: string): Promise<TaskUpdate>`; `listTaskUpdates(taskId: string): Promise<TaskUpdate[]>` (ordered oldest to newest).

- [ ] **Step 1: Write the failing test**

`tests/integration/taskUpdates.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { createThread } from "@/app/actions/threads";
import { createTask } from "@/app/actions/tasks";
import { addTaskUpdate, listTaskUpdates } from "@/app/actions/taskUpdates";
import { PermissionError } from "@/lib/permissions";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("task update comments", () => {
  let ownerId: string;
  let viewerId: string;
  let strangerId: string;
  let taskId: string;

  beforeEach(async () => {
    await resetDb();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const viewer = await db.user.create({ data: { email: "viewer@x.com", passwordHash: "x", name: "Viewer" } });
    const stranger = await db.user.create({ data: { email: "stranger@x.com", passwordHash: "x", name: "Stranger" } });
    ownerId = owner.id;
    viewerId = viewer.id;
    strangerId = stranger.id;

    await loginAs(ownerId);
    const thread = await createThread({ name: "Primary", categoryColor: "#f2c14e" });
    await db.threadShare.create({ data: { threadId: thread.id, sharedWithUserId: viewerId, permission: "VIEWER" } });
    const task = await createTask({ primaryThreadId: thread.id, title: "Draft summary" });
    taskId = task.id;
  });
  afterAll(async () => db.$disconnect());

  it("lets a viewer add a comment even though they can't edit the task", async () => {
    await loginAs(viewerId);
    const update = await addTaskUpdate(taskId, "Started digging into the numbers.");
    expect(update.body).toBe("Started digging into the numbers.");
    expect(update.authorId).toBe(viewerId);
  });

  it("blocks a stranger with no access from commenting", async () => {
    await loginAs(strangerId);
    await expect(addTaskUpdate(taskId, "Sneaky")).rejects.toThrow(PermissionError);
  });

  it("lists comments oldest to newest", async () => {
    await loginAs(ownerId);
    await addTaskUpdate(taskId, "First");
    await addTaskUpdate(taskId, "Second");

    const updates = await listTaskUpdates(taskId);
    expect(updates.map((u) => u.body)).toEqual(["First", "Second"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- taskUpdates.test.ts`
Expected: FAIL with "Cannot find module '@/app/actions/taskUpdates'"

- [ ] **Step 3: Write the implementation**

`app/actions/taskUpdates.ts`:

```ts
"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { resolveThreadRole, canComment, PermissionError } from "@/lib/permissions";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new PermissionError("You must be logged in.");
  return session.user.id;
}

async function requireCommentRole(taskId: string, userId: string) {
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
  if (!canComment(role)) throw new PermissionError();
}

export async function addTaskUpdate(taskId: string, body: string) {
  const userId = await requireUserId();
  await requireCommentRole(taskId, userId);
  return db.taskUpdate.create({ data: { taskId, authorId: userId, body } });
}

export async function listTaskUpdates(taskId: string) {
  const userId = await requireUserId();
  await requireCommentRole(taskId, userId);
  return db.taskUpdate.findMany({ where: { taskId }, orderBy: { createdAt: "asc" } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- taskUpdates.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/actions/taskUpdates.ts tests/integration/taskUpdates.test.ts
git commit -m "feat: add task update comments, viewable and postable by any collaborator"
```

---

### Task 8: Thread sharing

**Files:**
- Create: `app/actions/threadShares.ts`, `tests/integration/threadShares.test.ts`

**Interfaces:**
- Consumes: `db`, `auth()`, `resolveThreadRole`, `canManageShares`, `PermissionError`.
- Produces: `shareThread(threadId: string, email: string, permission: "VIEWER" | "EDITOR"): Promise<ThreadShare>`; `listThreadShares(threadId: string): Promise<ThreadShare[]>`; `revokeThreadShare(shareId: string): Promise<void>`.

- [ ] **Step 1: Write the failing test**

`tests/integration/threadShares.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { createThread } from "@/app/actions/threads";
import { shareThread, listThreadShares, revokeThreadShare } from "@/app/actions/threadShares";
import { PermissionError } from "@/lib/permissions";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("thread sharing", () => {
  let ownerId: string;
  let editorId: string;
  let threadId: string;

  beforeEach(async () => {
    await resetDb();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const editor = await db.user.create({ data: { email: "editor@x.com", passwordHash: "x", name: "Editor" } });
    ownerId = owner.id;
    editorId = editor.id;

    await loginAs(ownerId);
    const thread = await createThread({ name: "Primary", categoryColor: "#f2c14e" });
    threadId = thread.id;
  });
  afterAll(async () => db.$disconnect());

  it("lets the owner share a thread by email with a permission level", async () => {
    await loginAs(ownerId);
    const share = await shareThread(threadId, "editor@x.com", "EDITOR");
    expect(share.sharedWithUserId).toBe(editorId);
    expect(share.permission).toBe("EDITOR");
  });

  it("blocks a non-owner from sharing", async () => {
    await loginAs(ownerId);
    await shareThread(threadId, "editor@x.com", "EDITOR");

    await loginAs(editorId);
    await expect(shareThread(threadId, "someone-else@x.com", "VIEWER")).rejects.toThrow(PermissionError);
  });

  it("lists and revokes a share", async () => {
    await loginAs(ownerId);
    const share = await shareThread(threadId, "editor@x.com", "EDITOR");

    let shares = await listThreadShares(threadId);
    expect(shares).toHaveLength(1);

    await revokeThreadShare(share.id);
    shares = await listThreadShares(threadId);
    expect(shares).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- threadShares.test.ts`
Expected: FAIL with "Cannot find module '@/app/actions/threadShares'"

- [ ] **Step 3: Write the implementation**

`app/actions/threadShares.ts`:

```ts
"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { resolveThreadRole, canManageShares, PermissionError } from "@/lib/permissions";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new PermissionError("You must be logged in.");
  return session.user.id;
}

async function requireOwnerRole(threadId: string, userId: string) {
  const thread = await db.thread.findUniqueOrThrow({
    where: { id: threadId },
    include: { shares: true },
  });
  const role = resolveThreadRole({
    ownerId: thread.ownerId,
    shares: thread.shares.map((s) => ({ sharedWithUserId: s.sharedWithUserId, permission: s.permission })),
    userId,
  });
  if (!canManageShares(role)) throw new PermissionError();
}

export async function shareThread(threadId: string, email: string, permission: "VIEWER" | "EDITOR") {
  const userId = await requireUserId();
  await requireOwnerRole(threadId, userId);

  const recipient = await db.user.findUniqueOrThrow({ where: { email: email.trim().toLowerCase() } });
  return db.threadShare.create({
    data: { threadId, sharedWithUserId: recipient.id, permission },
  });
}

export async function listThreadShares(threadId: string) {
  const userId = await requireUserId();
  await requireOwnerRole(threadId, userId);
  return db.threadShare.findMany({ where: { threadId } });
}

export async function revokeThreadShare(shareId: string) {
  const userId = await requireUserId();
  const share = await db.threadShare.findUniqueOrThrow({ where: { id: shareId } });
  await requireOwnerRole(share.threadId, userId);
  await db.threadShare.delete({ where: { id: shareId } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- threadShares.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/actions/threadShares.ts tests/integration/threadShares.test.ts
git commit -m "feat: add thread sharing with owner-only invite/revoke"
```

---

### Task 9: Per-viewer task position

**Files:**
- Create: `app/actions/taskPositions.ts`, `tests/integration/taskPositions.test.ts`

**Interfaces:**
- Consumes: `db`, `auth()`, `resolveThreadRole`, `canViewThread`, `PermissionError`.
- Produces: `saveTaskPosition(taskId: string, positionX: number, positionY: number): Promise<TaskPosition>`; `getTaskPositions(taskIds: string[]): Promise<TaskPosition[]>` (for the current viewer only).

- [ ] **Step 1: Write the failing test**

`tests/integration/taskPositions.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { createThread } from "@/app/actions/threads";
import { createTask } from "@/app/actions/tasks";
import { saveTaskPosition, getTaskPositions } from "@/app/actions/taskPositions";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("task positions", () => {
  let ownerId: string;
  let viewerId: string;
  let taskId: string;

  beforeEach(async () => {
    await resetDb();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const viewer = await db.user.create({ data: { email: "viewer@x.com", passwordHash: "x", name: "Viewer" } });
    ownerId = owner.id;
    viewerId = viewer.id;

    await loginAs(ownerId);
    const thread = await createThread({ name: "Primary", categoryColor: "#f2c14e" });
    await db.threadShare.create({ data: { threadId: thread.id, sharedWithUserId: viewerId, permission: "VIEWER" } });
    const task = await createTask({ primaryThreadId: thread.id, title: "Shared task" });
    taskId = task.id;
  });
  afterAll(async () => db.$disconnect());

  it("stores position independently per viewer for the same shared task", async () => {
    await loginAs(ownerId);
    await saveTaskPosition(taskId, 100, 200);

    await loginAs(viewerId);
    await saveTaskPosition(taskId, 500, 600);

    const ownerPositions = await db.taskPosition.findMany({ where: { userId: ownerId } });
    const viewerPositions = await db.taskPosition.findMany({ where: { userId: viewerId } });

    expect(ownerPositions[0]).toMatchObject({ positionX: 100, positionY: 200 });
    expect(viewerPositions[0]).toMatchObject({ positionX: 500, positionY: 600 });
  });

  it("upserts on repeated saves rather than creating duplicates", async () => {
    await loginAs(ownerId);
    await saveTaskPosition(taskId, 1, 1);
    await saveTaskPosition(taskId, 2, 2);

    const positions = await db.taskPosition.findMany({ where: { userId: ownerId, taskId } });
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({ positionX: 2, positionY: 2 });
  });

  it("returns only the current viewer's positions from getTaskPositions", async () => {
    await loginAs(ownerId);
    await saveTaskPosition(taskId, 10, 10);
    await loginAs(viewerId);
    await saveTaskPosition(taskId, 20, 20);

    const positions = await getTaskPositions([taskId]);
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({ userId: viewerId, positionX: 20, positionY: 20 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- taskPositions.test.ts`
Expected: FAIL with "Cannot find module '@/app/actions/taskPositions'"

- [ ] **Step 3: Write the implementation**

`app/actions/taskPositions.ts`:

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

async function requireViewRole(taskId: string, userId: string) {
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
  if (!canViewThread(role)) throw new PermissionError();
}

export async function saveTaskPosition(taskId: string, positionX: number, positionY: number) {
  const userId = await requireUserId();
  await requireViewRole(taskId, userId);
  return db.taskPosition.upsert({
    where: { taskId_userId: { taskId, userId } },
    create: { taskId, userId, positionX, positionY },
    update: { positionX, positionY },
  });
}

export async function getTaskPositions(taskIds: string[]) {
  const userId = await requireUserId();
  return db.taskPosition.findMany({ where: { taskId: { in: taskIds }, userId } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- taskPositions.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/actions/taskPositions.ts tests/integration/taskPositions.test.ts
git commit -m "feat: add per-viewer task canvas position storage"
```

---

### Task 10: Theme preference storage and CSS variables

**Files:**
- Create: `app/actions/theme.ts`, `lib/theme.ts`, `components/theme/ThemeProvider.tsx`, `tests/unit/theme.test.ts`, `tests/component/ThemeProvider.test.tsx`

**Interfaces:**
- Consumes: `db`, `auth()`, `PermissionError`.
- Produces: `updateThemePreference(themeMode: "LIGHT" | "DARK", accentColor: string): Promise<User>`; `themeToCssVariables(themeMode: "LIGHT" | "DARK", accentColor: string): Record<string, string>`; `ThemeProvider({ themeMode, accentColor, children }): JSX.Element`.

- [ ] **Step 1: Write the failing unit test for CSS variable derivation**

`tests/unit/theme.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { themeToCssVariables } from "@/lib/theme";

describe("themeToCssVariables", () => {
  it("uses the full-strength accent color and a black base in dark mode", () => {
    const vars = themeToCssVariables("DARK", "#38e0ff");
    expect(vars["--accent"]).toBe("#38e0ff");
    expect(vars["--bg"]).toBe("#0a0e14");
    expect(vars["--glow-opacity"]).toBe("0.25");
  });

  it("keeps the same accent color but a bright base and softer glow in light mode", () => {
    const vars = themeToCssVariables("LIGHT", "#38e0ff");
    expect(vars["--accent"]).toBe("#38e0ff");
    expect(vars["--bg"]).toBe("#f5f7fa");
    expect(vars["--glow-opacity"]).toBe("0.12");
  });

  it("passes through any user-chosen hex color unchanged", () => {
    const vars = themeToCssVariables("DARK", "#ff5fa8");
    expect(vars["--accent"]).toBe("#ff5fa8");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- theme.test.ts`
Expected: FAIL with "Cannot find module '@/lib/theme'"

- [ ] **Step 3: Write `lib/theme.ts`**

```ts
export function themeToCssVariables(
  themeMode: "LIGHT" | "DARK",
  accentColor: string
): Record<string, string> {
  const isDark = themeMode === "DARK";
  return {
    "--accent": accentColor,
    "--bg": isDark ? "#0a0e14" : "#f5f7fa",
    "--panel-bg": isDark ? "rgba(15,25,35,0.85)" : "rgba(255,255,255,0.85)",
    "--text": isDark ? "#eafcff" : "#0a0e14",
    "--glow-opacity": isDark ? "0.25" : "0.12",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- theme.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing component test**

`tests/component/ThemeProvider.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import ThemeProvider from "@/components/theme/ThemeProvider";

describe("ThemeProvider", () => {
  it("applies theme CSS variables to the document root", () => {
    render(
      <ThemeProvider themeMode="DARK" accentColor="#38e0ff">
        <div>content</div>
      </ThemeProvider>
    );

    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#38e0ff");
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe("#0a0e14");
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- ThemeProvider.test.tsx`
Expected: FAIL with "Cannot find module '@/components/theme/ThemeProvider'"

- [ ] **Step 7: Write `components/theme/ThemeProvider.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { themeToCssVariables } from "@/lib/theme";

export default function ThemeProvider({
  themeMode,
  accentColor,
  children,
}: {
  themeMode: "LIGHT" | "DARK";
  accentColor: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const vars = themeToCssVariables(themeMode, accentColor);
    for (const [key, value] of Object.entries(vars)) {
      document.documentElement.style.setProperty(key, value);
    }
  }, [themeMode, accentColor]);

  return <>{children}</>;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- ThemeProvider.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 9: Write `app/actions/theme.ts`**

```ts
"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export async function updateThemePreference(themeMode: "LIGHT" | "DARK", accentColor: string) {
  const session = await auth();
  if (!session?.user?.id) throw new PermissionError("You must be logged in.");
  if (!HEX_COLOR.test(accentColor)) {
    throw new Error("accentColor must be a 6-digit hex value, e.g. #38e0ff.");
  }
  return db.user.update({
    where: { id: session.user.id },
    data: { themeMode, accentColor },
  });
}
```

- [ ] **Step 10: Commit**

```bash
git add app/actions/theme.ts lib/theme.ts components/theme/ThemeProvider.tsx tests/unit/theme.test.ts tests/component/ThemeProvider.test.tsx
git commit -m "feat: add theme preference storage and CSS variable application"
```

---

### Task 11: Accent color picker and theme toggle

**Files:**
- Create: `components/settings/AccentColorPicker.tsx`, `components/settings/ThemeToggle.tsx`, `tests/component/AccentColorPicker.test.tsx`, `tests/component/ThemeToggle.test.tsx`

**Interfaces:**
- Consumes: nothing beyond React (controlled components — the page that renders them wires `onChange` to `updateThemePreference`, Task 10).
- Produces: `AccentColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void })`; `ThemeToggle({ value, onChange }: { value: "LIGHT" | "DARK"; onChange: (mode: "LIGHT" | "DARK") => void })`.

- [ ] **Step 1: Write the failing tests**

`tests/component/AccentColorPicker.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AccentColorPicker from "@/components/settings/AccentColorPicker";

describe("AccentColorPicker", () => {
  it("shows the current color and reports any chosen hex value on change", () => {
    const onChange = vi.fn();
    render(<AccentColorPicker value="#38e0ff" onChange={onChange} />);

    const input = screen.getByLabelText("Accent color") as HTMLInputElement;
    expect(input.value).toBe("#38e0ff");

    fireEvent.change(input, { target: { value: "#ff5fa8" } });
    expect(onChange).toHaveBeenCalledWith("#ff5fa8");
  });
});
```

`tests/component/ThemeToggle.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ThemeToggle from "@/components/settings/ThemeToggle";

describe("ThemeToggle", () => {
  it("toggles between LIGHT and DARK on click", () => {
    const onChange = vi.fn();
    render(<ThemeToggle value="DARK" onChange={onChange} />);

    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith("LIGHT");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- AccentColorPicker.test.tsx ThemeToggle.test.tsx`
Expected: FAIL — both modules missing

- [ ] **Step 3: Write `components/settings/AccentColorPicker.tsx`**

The "full custom picker" the design called for is the native HTML color input — it opens the OS/browser color picker (hue, saturation, and a hex field), giving any hex value without hand-rolling a picker widget that risks poor contrast or dropped values.

```tsx
"use client";

export default function AccentColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span>Accent color</span>
      <input
        aria-label="Accent color"
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
```

- [ ] **Step 4: Write `components/settings/ThemeToggle.tsx`**

```tsx
"use client";

export default function ThemeToggle({
  value,
  onChange,
}: {
  value: "LIGHT" | "DARK";
  onChange: (mode: "LIGHT" | "DARK") => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={value === "DARK"}
      onClick={() => onChange(value === "DARK" ? "LIGHT" : "DARK")}
    >
      {value === "DARK" ? "🌙 Dark" : "☀️ Light"}
    </button>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- AccentColorPicker.test.tsx ThemeToggle.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add components/settings tests/component/AccentColorPicker.test.tsx tests/component/ThemeToggle.test.tsx
git commit -m "feat: add accent color picker and theme toggle controls"
```

---

### Task 12: Canvas — zoom tiers and thread-bubble layout

**Files:**
- Create: `components/canvas/zoomTier.ts`, `components/canvas/layout.ts`, `tests/unit/zoomTier.test.ts`, `tests/unit/layout.test.ts`

**Interfaces:**
- Consumes: nothing (pure modules).
- Produces: `ZOOM_TIER_THRESHOLD = 0.6`; `getZoomTier(zoom: number): "BUBBLE" | "CARD"`; `computeThreadCentroid(positions: { positionX: number; positionY: number }[]): { x: number; y: number }`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/zoomTier.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getZoomTier, ZOOM_TIER_THRESHOLD } from "@/components/canvas/zoomTier";

describe("getZoomTier", () => {
  it("returns BUBBLE below the threshold and CARD at or above it", () => {
    expect(getZoomTier(ZOOM_TIER_THRESHOLD - 0.01)).toBe("BUBBLE");
    expect(getZoomTier(ZOOM_TIER_THRESHOLD)).toBe("CARD");
    expect(getZoomTier(1.5)).toBe("CARD");
  });
});
```

`tests/unit/layout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeThreadCentroid } from "@/components/canvas/layout";

describe("computeThreadCentroid", () => {
  it("averages positions of all tasks in a thread", () => {
    const centroid = computeThreadCentroid([
      { positionX: 0, positionY: 0 },
      { positionX: 100, positionY: 200 },
    ]);
    expect(centroid).toEqual({ x: 50, y: 100 });
  });

  it("returns the origin for an empty thread", () => {
    expect(computeThreadCentroid([])).toEqual({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- zoomTier.test.ts layout.test.ts`
Expected: FAIL — both modules missing

- [ ] **Step 3: Write `components/canvas/zoomTier.ts`**

```ts
export const ZOOM_TIER_THRESHOLD = 0.6;

export function getZoomTier(zoom: number): "BUBBLE" | "CARD" {
  return zoom >= ZOOM_TIER_THRESHOLD ? "CARD" : "BUBBLE";
}
```

- [ ] **Step 4: Write `components/canvas/layout.ts`**

```ts
export function computeThreadCentroid(
  positions: { positionX: number; positionY: number }[]
): { x: number; y: number } {
  if (positions.length === 0) return { x: 0, y: 0 };
  const sum = positions.reduce(
    (acc, p) => ({ x: acc.x + p.positionX, y: acc.y + p.positionY }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / positions.length, y: sum.y / positions.length };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- zoomTier.test.ts layout.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add components/canvas/zoomTier.ts components/canvas/layout.ts tests/unit/zoomTier.test.ts tests/unit/layout.test.ts
git commit -m "feat: add zoom-tier threshold and thread centroid calculation"
```

---

### Task 13: Canvas nodes and board component

**Files:**
- Create: `components/canvas/TaskNode.tsx`, `components/canvas/ThreadBubbleNode.tsx`, `components/canvas/Canvas.tsx`, `app/canvas/page.tsx`, `tests/component/TaskNode.test.tsx`, `tests/component/ThreadBubbleNode.test.tsx`

**Interfaces:**
- Consumes: `getZoomTier` (Task 12); `getTaskPositions`, `saveTaskPosition` (Task 9); React Flow (`@xyflow/react`) `ReactFlow`, `useReactFlow`, `Background`, `Controls`.
- Produces: `TaskNode` and `ThreadBubbleNode` (React Flow custom node components, typed on `data`); `Canvas({ threads, tasks, positions }): JSX.Element` — the board itself.

- [ ] **Step 1: Write the failing node tests**

`tests/component/TaskNode.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import TaskNode from "@/components/canvas/TaskNode";

describe("TaskNode", () => {
  it("shows title, work status, priority, and update count", () => {
    render(
      <ReactFlowProvider>
        <TaskNode
          id="t1"
          data={{ title: "Draft exec summary", workStatus: "IN_PROGRESS", priority: "HIGH", updateCount: 3 }}
        />
      </ReactFlowProvider>
    );

    expect(screen.getByText("Draft exec summary")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("💬 3")).toBeInTheDocument();
  });
});
```

`tests/component/ThreadBubbleNode.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import ThreadBubbleNode from "@/components/canvas/ThreadBubbleNode";

describe("ThreadBubbleNode", () => {
  it("shows the thread name in its category color", () => {
    render(
      <ReactFlowProvider>
        <ThreadBubbleNode id="th1" data={{ name: "Q3 Report", categoryColor: "#f2c14e" }} />
      </ReactFlowProvider>
    );

    const bubble = screen.getByText("Q3 Report");
    expect(bubble).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- TaskNode.test.tsx ThreadBubbleNode.test.tsx`
Expected: FAIL — both modules missing

- [ ] **Step 3: Write `components/canvas/TaskNode.tsx`**

```tsx
import { Handle, Position } from "@xyflow/react";

const WORK_STATUS_LABEL: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};

const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

export default function TaskNode({
  data,
}: {
  id: string;
  data: { title: string; workStatus: string; priority: string; updateCount: number };
}) {
  return (
    <div
      className="task-card"
      style={{
        background: "var(--panel-bg)",
        borderLeft: "4px solid var(--accent)",
        borderRadius: 6,
        padding: 8,
        boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
        color: "var(--text)",
        minWidth: 150,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div style={{ fontWeight: 700, fontSize: 12 }}>{data.title}</div>
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        <span>{WORK_STATUS_LABEL[data.workStatus]}</span>
        <span>{PRIORITY_LABEL[data.priority]}</span>
      </div>
      <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>💬 {data.updateCount}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
```

- [ ] **Step 4: Write `components/canvas/ThreadBubbleNode.tsx`**

```tsx
export default function ThreadBubbleNode({
  data,
}: {
  id: string;
  data: { name: string; categoryColor: string };
}) {
  return (
    <div
      style={{
        background: data.categoryColor,
        borderRadius: 17,
        padding: "8px 16px",
        fontWeight: 700,
        fontSize: 12,
        boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
      }}
    >
      {data.name}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- TaskNode.test.tsx ThreadBubbleNode.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Write `components/canvas/Canvas.tsx`**

```tsx
"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useReactFlow,
  ReactFlowProvider,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getZoomTier } from "./zoomTier";
import { computeThreadCentroid } from "./layout";
import TaskNode from "./TaskNode";
import ThreadBubbleNode from "./ThreadBubbleNode";
import { saveTaskPosition } from "@/app/actions/taskPositions";

const nodeTypes = { task: TaskNode, threadBubble: ThreadBubbleNode };

type ThreadSummary = { id: string; name: string; categoryColor: string };
type TaskSummary = {
  id: string;
  primaryThreadId: string;
  title: string;
  workStatus: string;
  priority: string;
  updateCount: number;
};
type PositionMap = Record<string, { x: number; y: number }>;

function CanvasInner({
  threads,
  tasks,
  positions,
}: {
  threads: ThreadSummary[];
  tasks: TaskSummary[];
  positions: PositionMap;
}) {
  const { getZoom } = useReactFlow();
  const [tier, setTier] = useState<"BUBBLE" | "CARD">("CARD");

  const nodes = useMemo<Node[]>(() => {
    if (tier === "BUBBLE") {
      return threads.map((thread) => {
        const threadTaskPositions = tasks
          .filter((t) => t.primaryThreadId === thread.id)
          .map((t) => positions[t.id] ?? { x: 0, y: 0 })
          .map((p) => ({ positionX: p.x, positionY: p.y }));
        const centroid = computeThreadCentroid(threadTaskPositions);
        return {
          id: thread.id,
          type: "threadBubble",
          position: centroid,
          data: { name: thread.name, categoryColor: thread.categoryColor },
        };
      });
    }
    return tasks.map((task) => ({
      id: task.id,
      type: "task",
      position: positions[task.id] ?? { x: 0, y: 0 },
      data: {
        title: task.title,
        workStatus: task.workStatus,
        priority: task.priority,
        updateCount: task.updateCount,
      },
    }));
  }, [tier, threads, tasks, positions]);

  const handleMoveEnd = useCallback(() => {
    setTier(getZoomTier(getZoom()));
  }, [getZoom]);

  const handleNodeDragStop = useCallback((_: unknown, node: Node) => {
    if (node.type === "task") {
      void saveTaskPosition(node.id, node.position.x, node.position.y);
    }
  }, []);

  return (
    <ReactFlow
      nodes={nodes}
      nodeTypes={nodeTypes}
      onMoveEnd={handleMoveEnd}
      onNodeDragStop={handleNodeDragStop}
      fitView
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}

export default function Canvas(props: {
  threads: ThreadSummary[];
  tasks: TaskSummary[];
  positions: PositionMap;
}) {
  return (
    <div style={{ width: "100%", height: "100vh", background: "var(--bg)" }}>
      <ReactFlowProvider>
        <CanvasInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
```

- [ ] **Step 7: Write `app/canvas/page.tsx`**

```tsx
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import ThemeProvider from "@/components/theme/ThemeProvider";
import Canvas from "@/components/canvas/Canvas";

export default async function CanvasPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const ownThreads = await db.thread.findMany({
    where: { ownerId: userId, status: "ACTIVE" },
  });
  const sharedThreadIds = (
    await db.threadShare.findMany({ where: { sharedWithUserId: userId } })
  ).map((s) => s.threadId);
  const sharedThreads = await db.thread.findMany({
    where: { id: { in: sharedThreadIds }, status: "ACTIVE" },
  });
  const threads = [...ownThreads, ...sharedThreads];

  const tasks = await db.task.findMany({
    where: { primaryThreadId: { in: threads.map((t) => t.id) }, lifecycleStatus: "ACTIVE" },
    include: { _count: { select: { updates: true } } },
  });

  const taskPositions = await db.taskPosition.findMany({
    where: { taskId: { in: tasks.map((t) => t.id) }, userId },
  });
  const positions = Object.fromEntries(
    taskPositions.map((p) => [p.taskId, { x: p.positionX, y: p.positionY }])
  );

  return (
    <ThemeProvider themeMode={user.themeMode} accentColor={user.accentColor}>
      <Canvas
        threads={threads.map((t) => ({ id: t.id, name: t.name, categoryColor: t.categoryColor }))}
        tasks={tasks.map((t) => ({
          id: t.id,
          primaryThreadId: t.primaryThreadId,
          title: t.title,
          workStatus: t.workStatus,
          priority: t.priority,
          updateCount: t._count.updates,
        }))}
        positions={positions}
      />
    </ThemeProvider>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add components/canvas app/canvas tests/component/TaskNode.test.tsx tests/component/ThreadBubbleNode.test.tsx
git commit -m "feat: add React Flow canvas with zoom-tier switching between bubbles and cards"
```

---

### Task 14: Card action menu (rename, delete, move, close)

**Files:**
- Create: `components/canvas/CardMenu.tsx`, `tests/component/CardMenu.test.tsx`

**Interfaces:**
- Consumes: nothing beyond React (parent wires callbacks to the relevant Server Actions from Tasks 5–6).
- Produces: `CardMenu` — for `variant="task"`: props `onRename`, `onMoveToThread`, `onLinkSecondaryThread`, `onDelete`; for `variant="thread"`: props `onRename`, `onChangeColor`, `onClose`, `onDelete`.

- [ ] **Step 1: Write the failing test**

`tests/component/CardMenu.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import CardMenu from "@/components/canvas/CardMenu";

describe("CardMenu", () => {
  it("opens on click and invokes the right handler for a task variant", () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(
      <CardMenu
        variant="task"
        onRename={onRename}
        onMoveToThread={vi.fn()}
        onLinkSecondaryThread={vi.fn()}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByText("Rename"));
    expect(onRename).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalled();
  });

  it("shows Close and no Move/Link items for a thread variant", () => {
    render(
      <CardMenu
        variant="thread"
        onRename={vi.fn()}
        onChangeColor={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByText("Close thread")).toBeInTheDocument();
    expect(screen.queryByText("Move to thread…")).not.toBeInTheDocument();
  });

  it("opens on long-press (pointer down held past the threshold)", () => {
    vi.useFakeTimers();
    const onRename = vi.fn();
    render(
      <CardMenu
        variant="task"
        onRename={onRename}
        onMoveToThread={vi.fn()}
        onLinkSecondaryThread={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const card = screen.getByTestId("card-menu-trigger-area");
    fireEvent.pointerDown(card);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.pointerUp(card);

    expect(screen.getByText("Rename")).toBeInTheDocument();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- CardMenu.test.tsx`
Expected: FAIL with "Cannot find module '@/components/canvas/CardMenu'"

- [ ] **Step 3: Write the implementation**

`components/canvas/CardMenu.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";

type TaskMenuProps = {
  variant: "task";
  onRename: () => void;
  onMoveToThread: () => void;
  onLinkSecondaryThread: () => void;
  onDelete: () => void;
};

type ThreadMenuProps = {
  variant: "thread";
  onRename: () => void;
  onChangeColor: () => void;
  onClose: () => void;
  onDelete: () => void;
};

const LONG_PRESS_MS = 450;

export default function CardMenu(props: TaskMenuProps | ThreadMenuProps) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function startLongPress() {
    timerRef.current = setTimeout(() => setOpen(true), LONG_PRESS_MS);
  }

  function cancelLongPress() {
    if (timerRef.current) clearTimeout(timerRef.current);
  }

  function runAndClose(handler: () => void) {
    handler();
    setOpen(false);
  }

  return (
    <div
      data-testid="card-menu-trigger-area"
      onPointerDown={startLongPress}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      style={{ position: "relative" }}
    >
      <button aria-label="More actions" onClick={() => setOpen((o) => !o)}>
        ⋮
      </button>
      {open && (
        <div role="menu" style={{ position: "absolute", background: "var(--panel-bg)" }}>
          {props.variant === "task" ? (
            <>
              <button role="menuitem" onClick={() => runAndClose(props.onRename)}>Rename</button>
              <button role="menuitem" onClick={() => runAndClose(props.onMoveToThread)}>Move to thread…</button>
              <button role="menuitem" onClick={() => runAndClose(props.onLinkSecondaryThread)}>Link secondary thread…</button>
              <button role="menuitem" onClick={() => runAndClose(props.onDelete)}>Delete</button>
            </>
          ) : (
            <>
              <button role="menuitem" onClick={() => runAndClose(props.onRename)}>Rename thread</button>
              <button role="menuitem" onClick={() => runAndClose(props.onChangeColor)}>Change category color</button>
              <button role="menuitem" onClick={() => runAndClose(props.onClose)}>Close thread</button>
              <button role="menuitem" onClick={() => runAndClose(props.onDelete)}>Delete thread</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- CardMenu.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add components/canvas/CardMenu.tsx tests/component/CardMenu.test.tsx
git commit -m "feat: add task/thread action menu with click and long-press triggers"
```

---

### Task 15: Task detail panel

**Files:**
- Create: `components/task-detail/TaskDetailPanel.tsx`, `tests/component/TaskDetailPanel.test.tsx`

**Interfaces:**
- Consumes: `updateTask` (Task 6); `addTaskUpdate`, `listTaskUpdates` (Task 7) — passed in as props so the component stays testable without mocking modules.
- Produces: `TaskDetailPanel({ task, updates, onUpdateTask, onAddComment, onClose }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

`tests/component/TaskDetailPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TaskDetailPanel from "@/components/task-detail/TaskDetailPanel";

const task = {
  id: "t1",
  title: "Draft exec summary",
  description: "Pull together the Q3 numbers.",
  workStatus: "IN_PROGRESS" as const,
  priority: "HIGH" as const,
  dueDate: null,
};

const updates = [{ id: "u1", body: "Started on the intro.", authorId: "a1", createdAt: new Date("2026-01-01") }];

describe("TaskDetailPanel", () => {
  it("shows the task fields and comment log", () => {
    render(
      <TaskDetailPanel task={task} updates={updates} onUpdateTask={vi.fn()} onAddComment={vi.fn()} onClose={vi.fn()} />
    );

    expect(screen.getByDisplayValue("Draft exec summary")).toBeInTheDocument();
    expect(screen.getByText("Started on the intro.")).toBeInTheDocument();
  });

  it("submits a status change via onUpdateTask", () => {
    const onUpdateTask = vi.fn();
    render(
      <TaskDetailPanel task={task} updates={updates} onUpdateTask={onUpdateTask} onAddComment={vi.fn()} onClose={vi.fn()} />
    );

    fireEvent.change(screen.getByLabelText("Work status"), { target: { value: "DONE" } });
    expect(onUpdateTask).toHaveBeenCalledWith({ workStatus: "DONE" });
  });

  it("submits a new comment via onAddComment and clears the input", () => {
    const onAddComment = vi.fn();
    render(
      <TaskDetailPanel task={task} updates={updates} onUpdateTask={vi.fn()} onAddComment={onAddComment} onClose={vi.fn()} />
    );

    const input = screen.getByLabelText("Add an update") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Pulled the numbers." } });
    fireEvent.click(screen.getByText("Post update"));

    expect(onAddComment).toHaveBeenCalledWith("Pulled the numbers.");
    expect(input.value).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- TaskDetailPanel.test.tsx`
Expected: FAIL with "Cannot find module '@/components/task-detail/TaskDetailPanel'"

- [ ] **Step 3: Write the implementation**

`components/task-detail/TaskDetailPanel.tsx`:

```tsx
"use client";

import { useState } from "react";

type Task = {
  id: string;
  title: string;
  description: string;
  workStatus: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: Date | null;
};

type TaskUpdateItem = { id: string; body: string; authorId: string; createdAt: Date };

export default function TaskDetailPanel({
  task,
  updates,
  onUpdateTask,
  onAddComment,
  onClose,
}: {
  task: Task;
  updates: TaskUpdateItem[];
  onUpdateTask: (patch: Partial<Pick<Task, "title" | "description" | "workStatus" | "priority" | "dueDate">>) => void;
  onAddComment: (body: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div role="dialog" aria-label="Task detail" style={{ background: "var(--panel-bg)", color: "var(--text)" }}>
      <button aria-label="Close" onClick={onClose}>×</button>

      <input
        aria-label="Title"
        value={task.title}
        onChange={(e) => onUpdateTask({ title: e.target.value })}
      />
      <textarea
        aria-label="Description"
        value={task.description}
        onChange={(e) => onUpdateTask({ description: e.target.value })}
      />

      <label>
        Work status
        <select
          aria-label="Work status"
          value={task.workStatus}
          onChange={(e) => onUpdateTask({ workStatus: e.target.value as Task["workStatus"] })}
        >
          <option value="TODO">To Do</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="DONE">Done</option>
        </select>
      </label>

      <label>
        Priority
        <select
          aria-label="Priority"
          value={task.priority}
          onChange={(e) => onUpdateTask({ priority: e.target.value as Task["priority"] })}
        >
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
      </label>

      <div>
        {updates.map((u) => (
          <p key={u.id}>{u.body}</p>
        ))}
      </div>

      <textarea aria-label="Add an update" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button
        onClick={() => {
          onAddComment(draft);
          setDraft("");
        }}
      >
        Post update
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- TaskDetailPanel.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add components/task-detail tests/component/TaskDetailPanel.test.tsx
git commit -m "feat: add task detail panel with editable fields and comment log"
```

---

### Task 16: Recycle bin

**Files:**
- Create: `app/actions/recycleBin.ts`, `app/recycle-bin/page.tsx`, `tests/integration/recycleBin.test.ts`

**Interfaces:**
- Consumes: `db`, `auth()`, `PermissionError`.
- Produces: `listDeletedItems(): Promise<{ threads: Thread[]; tasks: Task[] }>`; `restoreThread(threadId: string): Promise<Thread>`; `restoreTask(taskId: string): Promise<Task>`; `emptyRecycleBin(): Promise<{ threadsDeleted: number; tasksDeleted: number }>`.

- [ ] **Step 1: Write the failing test**

`tests/integration/recycleBin.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { createThread, deleteThread } from "@/app/actions/threads";
import { createTask, deleteTask } from "@/app/actions/tasks";
import { listDeletedItems, restoreThread, restoreTask, emptyRecycleBin } from "@/app/actions/recycleBin";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("recycle bin", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    ownerId = owner.id;
    await loginAs(ownerId);
  });
  afterAll(async () => db.$disconnect());

  it("lists only the current user's deleted threads and tasks", async () => {
    const thread = await createThread({ name: "Doomed thread", categoryColor: "#f2c14e" });
    const task = await createTask({ primaryThreadId: thread.id, title: "Doomed task" });
    await deleteTask(task.id);

    const otherThread = await createThread({ name: "Kept thread", categoryColor: "#38e0ff" });
    await createTask({ primaryThreadId: otherThread.id, title: "Kept task" });

    const { threads, tasks } = await listDeletedItems();
    expect(threads).toHaveLength(0);
    expect(tasks.map((t) => t.title)).toEqual(["Doomed task"]);

    await deleteThread(thread.id);
    const afterThreadDelete = await listDeletedItems();
    expect(afterThreadDelete.threads.map((t) => t.name)).toEqual(["Doomed thread"]);
  });

  it("restores a deleted task back to ACTIVE", async () => {
    const thread = await createThread({ name: "Thread", categoryColor: "#f2c14e" });
    const task = await createTask({ primaryThreadId: thread.id, title: "Restorable" });
    await deleteTask(task.id);

    const restored = await restoreTask(task.id);
    expect(restored.lifecycleStatus).toBe("ACTIVE");
    expect(restored.deletedAt).toBeNull();
  });

  it("restores a deleted thread back to ACTIVE", async () => {
    const thread = await createThread({ name: "Thread", categoryColor: "#f2c14e" });
    await deleteThread(thread.id);

    const restored = await restoreThread(thread.id);
    expect(restored.status).toBe("ACTIVE");
    expect(restored.deletedAt).toBeNull();
  });

  it("empties the recycle bin, hard-deleting everything currently marked deleted", async () => {
    const thread = await createThread({ name: "Thread", categoryColor: "#f2c14e" });
    const task = await createTask({ primaryThreadId: thread.id, title: "Task" });
    await deleteTask(task.id);

    const result = await emptyRecycleBin();
    expect(result.tasksDeleted).toBe(1);

    const found = await db.task.findUnique({ where: { id: task.id } });
    expect(found).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- recycleBin.test.ts`
Expected: FAIL with "Cannot find module '@/app/actions/recycleBin'"

- [ ] **Step 3: Write the implementation**

`app/actions/recycleBin.ts`:

```ts
"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new PermissionError("You must be logged in.");
  return session.user.id;
}

export async function listDeletedItems() {
  const userId = await requireUserId();
  const threads = await db.thread.findMany({ where: { ownerId: userId, status: "DELETED" } });
  const ownedThreadIds = (await db.thread.findMany({ where: { ownerId: userId } })).map((t) => t.id);
  const tasks = await db.task.findMany({
    where: { primaryThreadId: { in: ownedThreadIds }, lifecycleStatus: "DELETED" },
  });
  return { threads, tasks };
}

export async function restoreThread(threadId: string) {
  const userId = await requireUserId();
  const thread = await db.thread.findUniqueOrThrow({ where: { id: threadId } });
  if (thread.ownerId !== userId) throw new PermissionError();
  return db.thread.update({ where: { id: threadId }, data: { status: "ACTIVE", deletedAt: null } });
}

export async function restoreTask(taskId: string) {
  const userId = await requireUserId();
  const task = await db.task.findUniqueOrThrow({ where: { id: taskId }, include: { primaryThread: true } });
  if (task.primaryThread.ownerId !== userId) throw new PermissionError();
  return db.task.update({ where: { id: taskId }, data: { lifecycleStatus: "ACTIVE", deletedAt: null } });
}

export async function emptyRecycleBin() {
  const userId = await requireUserId();
  const { threads, tasks } = await listDeletedItems();

  const tasksDeleted = await db.task.deleteMany({ where: { id: { in: tasks.map((t) => t.id) } } });
  const threadsDeleted = await db.thread.deleteMany({ where: { id: { in: threads.map((t) => t.id) } } });

  return { threadsDeleted: threadsDeleted.count, tasksDeleted: tasksDeleted.count };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- recycleBin.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Write `app/recycle-bin/page.tsx`**

```tsx
import { listDeletedItems } from "@/app/actions/recycleBin";

export default async function RecycleBinPage() {
  const { threads, tasks } = await listDeletedItems();

  return (
    <div>
      <h1>Recycle Bin</h1>
      <p>Items here are permanently deleted 30 days after being moved to the bin. Use "Empty Recycle Bin" to delete them immediately instead.</p>
      <ul>
        {threads.map((t) => (
          <li key={t.id}>{t.name} (thread)</li>
        ))}
        {tasks.map((t) => (
          <li key={t.id}>{t.title} (task)</li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add app/actions/recycleBin.ts app/recycle-bin tests/integration/recycleBin.test.ts
git commit -m "feat: add recycle bin with restore and empty-bin actions"
```

---

### Task 17: 30-day auto-purge job

**Files:**
- Create: `lib/purge.ts`, `app/api/purge/route.ts`, `tests/unit/purge.test.ts`, `tests/integration/purge.test.ts`

**Interfaces:**
- Consumes: `db`.
- Produces: `PURGE_THRESHOLD_DAYS = 30`; `isPastPurgeThreshold(deletedAt: Date, now: Date): boolean`; `purgeExpiredItems(now: Date): Promise<{ threadsDeleted: number; tasksDeleted: number }>`.

- [ ] **Step 1: Write the failing unit test**

`tests/unit/purge.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isPastPurgeThreshold, PURGE_THRESHOLD_DAYS } from "@/lib/purge";

describe("isPastPurgeThreshold", () => {
  const now = new Date("2026-03-01T00:00:00Z");

  it(`is false exactly at ${PURGE_THRESHOLD_DAYS} days`, () => {
    const deletedAt = new Date(now.getTime() - PURGE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
    expect(isPastPurgeThreshold(deletedAt, now)).toBe(false);
  });

  it(`is true just past ${PURGE_THRESHOLD_DAYS} days`, () => {
    const deletedAt = new Date(now.getTime() - (PURGE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000 + 1));
    expect(isPastPurgeThreshold(deletedAt, now)).toBe(true);
  });

  it("is false for something deleted yesterday", () => {
    const deletedAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    expect(isPastPurgeThreshold(deletedAt, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- purge.test.ts`
Expected: FAIL with "Cannot find module '@/lib/purge'"

- [ ] **Step 3: Write `lib/purge.ts`**

```ts
import { db } from "@/lib/db";

export const PURGE_THRESHOLD_DAYS = 30;

export function isPastPurgeThreshold(deletedAt: Date, now: Date): boolean {
  const ageMs = now.getTime() - deletedAt.getTime();
  return ageMs > PURGE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
}

function cutoff(now: Date): Date {
  return new Date(now.getTime() - PURGE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
}

export async function purgeExpiredItems(now: Date) {
  const tasksDeleted = await db.task.deleteMany({
    where: { lifecycleStatus: "DELETED", deletedAt: { lt: cutoff(now) } },
  });
  const threadsDeleted = await db.thread.deleteMany({
    where: { status: "DELETED", deletedAt: { lt: cutoff(now) } },
  });
  return { threadsDeleted: threadsDeleted.count, tasksDeleted: tasksDeleted.count };
}
```

- [ ] **Step 4: Run unit test to verify it passes**

Run: `npm test -- purge.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing DB integration test**

`tests/integration/purge.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { purgeExpiredItems, PURGE_THRESHOLD_DAYS } from "@/lib/purge";

describe("purgeExpiredItems", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  it("hard-deletes tasks and threads past the 30-day threshold, keeps recent ones", async () => {
    const owner = await db.user.create({ data: { email: "o@x.com", passwordHash: "x", name: "O" } });
    const thread = await db.thread.create({ data: { ownerId: owner.id, name: "T", categoryColor: "#fff" } });

    const now = new Date("2026-03-01T00:00:00Z");
    const oldDate = new Date(now.getTime() - (PURGE_THRESHOLD_DAYS + 1) * 24 * 60 * 60 * 1000);
    const recentDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

    const oldTask = await db.task.create({
      data: { primaryThreadId: thread.id, title: "Old", lifecycleStatus: "DELETED", deletedAt: oldDate },
    });
    const recentTask = await db.task.create({
      data: { primaryThreadId: thread.id, title: "Recent", lifecycleStatus: "DELETED", deletedAt: recentDate },
    });

    const result = await purgeExpiredItems(now);
    expect(result.tasksDeleted).toBe(1);

    expect(await db.task.findUnique({ where: { id: oldTask.id } })).toBeNull();
    expect(await db.task.findUnique({ where: { id: recentTask.id } })).not.toBeNull();
  });
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- purge.test.ts`
Expected: PASS (both unit and integration files, 4 tests total)

- [ ] **Step 7: Write the scheduled route**

`app/api/purge/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { purgeExpiredItems } from "@/lib/purge";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-purge-secret");
  if (secret !== process.env.PURGE_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await purgeExpiredItems(new Date());
  return NextResponse.json(result);
}
```

Note: trigger this route on a daily schedule from an external scheduler (e.g. a Vercel Cron entry in `vercel.json`, or a scheduled GitHub Actions workflow) that sends the `x-purge-secret` header matching `PURGE_SECRET`.

- [ ] **Step 8: Commit**

```bash
git add lib/purge.ts app/api/purge tests/unit/purge.test.ts tests/integration/purge.test.ts
git commit -m "feat: add 30-day recycle bin auto-purge job and scheduled endpoint"
```

---

### Task 18: PWA manifest and service worker

**Files:**
- Create: `public/manifest.json`, `public/sw.js`, `components/pwa/ServiceWorkerRegistration.tsx`, `tests/unit/manifest.test.ts`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: a valid, installable web app manifest; `ServiceWorkerRegistration()` — a client component that registers `public/sw.js` on mount.

- [ ] **Step 1: Write the failing test**

`tests/unit/manifest.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("PWA manifest", () => {
  it("is valid JSON with the fields required for installability", () => {
    const raw = fs.readFileSync(path.resolve(__dirname, "../../public/manifest.json"), "utf-8");
    const manifest = JSON.parse(raw);

    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe("/canvas");
    expect(manifest.display).toBe("standalone");
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- manifest.test.ts`
Expected: FAIL with "ENOENT: no such file or directory, open '.../public/manifest.json'"

- [ ] **Step 3: Write `public/manifest.json`**

```json
{
  "name": "Arc — Thread-Based Task Canvas",
  "short_name": "Arc",
  "start_url": "/canvas",
  "display": "standalone",
  "background_color": "#0a0e14",
  "theme_color": "#0a0e14",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Add placeholder 192×192 and 512×512 PNG icons under `public/icons/` (any square PNG works for now — replace with real branding art later).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- manifest.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Write `public/sw.js`**

```js
const CACHE_NAME = "arc-shell-v1";
const SHELL_ASSETS = ["/", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request))
  );
});
```

- [ ] **Step 6: Write `components/pwa/ServiceWorkerRegistration.tsx`**

```tsx
"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installability degrades gracefully without the service worker.
      });
    }
  }, []);
  return null;
}
```

- [ ] **Step 7: Wire into `app/layout.tsx`**

Add to the `<head>`: `<link rel="manifest" href="/manifest.json" />` and `<meta name="theme-color" content="#0a0e14" />`. Add `<ServiceWorkerRegistration />` inside `<body>`.

- [ ] **Step 8: Commit**

```bash
git add public/manifest.json public/sw.js components/pwa app/layout.tsx tests/unit/manifest.test.ts
git commit -m "feat: add PWA manifest and service worker registration"
```

---

### Task 19: Creation forms, share dialog, and recycle-bin restore buttons

The Server Actions from Tasks 5, 6, 8, and 16 have no UI entry points yet — this task wires up the remaining forms/buttons so a user can actually create a thread/task, share a thread, and restore/empty the recycle bin from the browser (needed for the end-to-end test in Task 20). It also wires Task 15's `TaskDetailPanel` into the canvas — nothing built so far actually opens it on a task click, and Task 20's end-to-end test depends on clicking a task and seeing the detail panel's comment form.

**Files:**
- Create: `components/canvas/NewThreadButton.tsx`, `components/canvas/NewTaskButton.tsx`, `components/canvas/ShareThreadDialog.tsx`, `tests/component/NewThreadButton.test.tsx`, `tests/component/ShareThreadDialog.test.tsx`
- Modify: `components/canvas/Canvas.tsx`, `app/canvas/page.tsx`, `app/recycle-bin/page.tsx`

**Interfaces:**
- Consumes: `createThread` (Task 5), `createTask` (Task 6), `updateTask` (Task 6), `shareThread` (Task 8), `addTaskUpdate`, `listTaskUpdates` (Task 7), `restoreThread`, `restoreTask`, `emptyRecycleBin` (Task 16), `TaskDetailPanel` (Task 15).
- Produces: `NewThreadButton({ onCreate }: { onCreate: (input: { name: string; categoryColor: string }) => void })`; `NewTaskButton({ threadId, onCreate }: { threadId: string; onCreate: (input: { title: string }) => void })`; `ShareThreadDialog({ threadId, onShare }: { threadId: string; onShare: (email: string, permission: "VIEWER" | "EDITOR") => void })`.

- [ ] **Step 1: Write the failing tests**

`tests/component/NewThreadButton.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NewThreadButton from "@/components/canvas/NewThreadButton";

describe("NewThreadButton", () => {
  it("opens a form and submits the thread name and color", () => {
    const onCreate = vi.fn();
    render(<NewThreadButton onCreate={onCreate} />);

    fireEvent.click(screen.getByRole("button", { name: "New thread" }));
    fireEvent.change(screen.getByLabelText("Thread name"), { target: { value: "Q3 Report" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(onCreate).toHaveBeenCalledWith({ name: "Q3 Report", categoryColor: expect.any(String) });
  });
});
```

`tests/component/ShareThreadDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ShareThreadDialog from "@/components/canvas/ShareThreadDialog";

describe("ShareThreadDialog", () => {
  it("submits the entered email and chosen permission", () => {
    const onShare = vi.fn();
    render(<ShareThreadDialog threadId="th1" onShare={onShare} />);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "viewer@example.com" } });
    fireEvent.change(screen.getByLabelText("Permission"), { target: { value: "VIEWER" } });
    fireEvent.click(screen.getByRole("button", { name: "Share thread" }));

    expect(onShare).toHaveBeenCalledWith("viewer@example.com", "VIEWER");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- NewThreadButton.test.tsx ShareThreadDialog.test.tsx`
Expected: FAIL — both modules missing

- [ ] **Step 3: Write `components/canvas/NewThreadButton.tsx`**

```tsx
"use client";

import { useState } from "react";

const DEFAULT_COLOR = "#38e0ff";

export default function NewThreadButton({
  onCreate,
}: {
  onCreate: (input: { name: string; categoryColor: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [categoryColor, setCategoryColor] = useState(DEFAULT_COLOR);

  if (!open) {
    return <button onClick={() => setOpen(true)}>New thread</button>;
  }

  return (
    <div role="dialog" aria-label="New thread">
      <label>
        Thread name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Color
        <input type="color" value={categoryColor} onChange={(e) => setCategoryColor(e.target.value)} />
      </label>
      <button
        onClick={() => {
          onCreate({ name, categoryColor });
          setOpen(false);
          setName("");
        }}
      >
        Create
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Write `components/canvas/NewTaskButton.tsx`**

```tsx
"use client";

import { useState } from "react";

export default function NewTaskButton({
  threadId,
  onCreate,
}: {
  threadId: string;
  onCreate: (input: { title: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  if (!open) {
    return <button onClick={() => setOpen(true)}>New task</button>;
  }

  return (
    <div role="dialog" aria-label={`New task in ${threadId}`}>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <button
        onClick={() => {
          onCreate({ title });
          setOpen(false);
          setTitle("");
        }}
      >
        Create task
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Write `components/canvas/ShareThreadDialog.tsx`**

```tsx
"use client";

import { useState } from "react";

export default function ShareThreadDialog({
  threadId,
  onShare,
}: {
  threadId: string;
  onShare: (email: string, permission: "VIEWER" | "EDITOR") => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"VIEWER" | "EDITOR">("VIEWER");

  if (!open) {
    return <button onClick={() => setOpen(true)}>Share</button>;
  }

  return (
    <div role="dialog" aria-label={`Share thread ${threadId}`}>
      <label>
        Email
        <input aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Permission
        <select
          aria-label="Permission"
          value={permission}
          onChange={(e) => setPermission(e.target.value as "VIEWER" | "EDITOR")}
        >
          <option value="VIEWER">Viewer</option>
          <option value="EDITOR">Editor</option>
        </select>
      </label>
      <button
        onClick={() => {
          onShare(email, permission);
          setOpen(false);
        }}
      >
        Share thread
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- NewThreadButton.test.tsx ShareThreadDialog.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 7: Wire the buttons into `Canvas.tsx` and add restore/empty buttons to the recycle bin page**

In `components/canvas/Canvas.tsx`, import `NewThreadButton`, `NewTaskButton`, and `ShareThreadDialog`; render `NewThreadButton` calling the `createThread` Server Action, `NewTaskButton` per selected thread calling `createTask`, and `ShareThreadDialog` per thread bubble calling `shareThread` — each wrapped in a small `async (input) => { await action(...); router.refresh(); }` handler so the canvas re-fetches after a mutation.

Update `app/recycle-bin/page.tsx` to add a Restore button per item and an Empty Recycle Bin button:

```tsx
import { listDeletedItems, restoreThread, restoreTask, emptyRecycleBin } from "@/app/actions/recycleBin";

export default async function RecycleBinPage() {
  const { threads, tasks } = await listDeletedItems();

  async function handleRestoreThread(formData: FormData) {
    "use server";
    await restoreThread(String(formData.get("threadId")));
  }

  async function handleRestoreTask(formData: FormData) {
    "use server";
    await restoreTask(String(formData.get("taskId")));
  }

  async function handleEmpty() {
    "use server";
    await emptyRecycleBin();
  }

  return (
    <div>
      <h1>Recycle Bin</h1>
      <p>Items here are permanently deleted 30 days after being moved to the bin. Use "Empty Recycle Bin" to delete them immediately instead.</p>
      <ul>
        {threads.map((t) => (
          <li key={t.id}>
            {t.name} (thread)
            <form action={handleRestoreThread}>
              <input type="hidden" name="threadId" value={t.id} />
              <button type="submit">Restore</button>
            </form>
          </li>
        ))}
        {tasks.map((t) => (
          <li key={t.id}>
            {t.title} (task)
            <form action={handleRestoreTask}>
              <input type="hidden" name="taskId" value={t.id} />
              <button type="submit">Restore</button>
            </form>
          </li>
        ))}
      </ul>
      <form action={handleEmpty}>
        <button type="submit">Empty Recycle Bin</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 8: Wire `TaskDetailPanel` into the canvas**

`app/canvas/page.tsx`'s task query already selects full `Task` rows (Prisma returns every column by default) — extend the plain object it maps into the `tasks` prop passed to `<Canvas>` to also include `description` and `dueDate`, so `Canvas` has everything `TaskDetailPanel` needs without a second fetch for those two fields:

```tsx
tasks={tasks.map((t) => ({
  id: t.id,
  primaryThreadId: t.primaryThreadId,
  title: t.title,
  description: t.description,
  workStatus: t.workStatus,
  priority: t.priority,
  dueDate: t.dueDate,
  updateCount: t._count.updates,
}))}
```

In `components/canvas/Canvas.tsx`, extend the `TaskSummary` type with `description: string` and `dueDate: Date | null`, add `selectedTaskId` and `selectedTaskUpdates` state, and render the panel when a task card is clicked:

```tsx
import TaskDetailPanel from "@/components/task-detail/TaskDetailPanel";
import { updateTask } from "@/app/actions/tasks";
import { addTaskUpdate, listTaskUpdates } from "@/app/actions/taskUpdates";

// inside CanvasInner, alongside the existing tier/nodes state:
const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
const [selectedTaskUpdates, setSelectedTaskUpdates] = useState<
  { id: string; body: string; authorId: string; createdAt: Date }[]
>([]);

const handleNodeClick = useCallback(async (_: unknown, node: Node) => {
  if (node.type !== "task") return;
  setSelectedTaskId(node.id);
  setSelectedTaskUpdates(await listTaskUpdates(node.id));
}, []);

const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
```

Pass `onNodeClick={handleNodeClick}` to `<ReactFlow>` alongside the existing `onNodeDragStop`, and render the panel as a sibling of `<ReactFlow>` inside the same wrapper `<div>`:

```tsx
{selectedTask && (
  <TaskDetailPanel
    task={selectedTask}
    updates={selectedTaskUpdates}
    onUpdateTask={async (patch) => {
      await updateTask(selectedTask.id, patch);
    }}
    onAddComment={async (body) => {
      await addTaskUpdate(selectedTask.id, body);
      setSelectedTaskUpdates(await listTaskUpdates(selectedTask.id));
    }}
    onClose={() => setSelectedTaskId(null)}
  />
)}
```

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: PASS (every test from Tasks 1–19)

- [ ] **Step 10: Commit**

```bash
git add components/canvas/NewThreadButton.tsx components/canvas/NewTaskButton.tsx components/canvas/ShareThreadDialog.tsx app/recycle-bin/page.tsx app/canvas/page.tsx components/canvas/Canvas.tsx tests/component/NewThreadButton.test.tsx tests/component/ShareThreadDialog.test.tsx
git commit -m "feat: wire up thread/task creation, sharing, recycle-bin restore, and task detail panel UI"
```

---

### Task 20: End-to-end regression test

**Files:**
- Create: `tests/e2e/foundation-flow.spec.ts`

**Interfaces:**
- Consumes: the running app (`npm run dev`, per `playwright.config.ts` from Task 1) and every Server Action/page from Tasks 4–16.

- [ ] **Step 1: Write the end-to-end test**

`tests/e2e/foundation-flow.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("signup, thread/task creation, sharing, delete, and recycle-bin restore", async ({ page, browser }) => {
  const email = `owner-${Date.now()}@example.com`;

  await page.goto("/signup");
  await page.getByPlaceholder("Name").fill("Owner");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill("correcthorse123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/canvas/);

  await page.getByRole("button", { name: "New thread" }).click();
  await page.getByLabel("Thread name").fill("Q3 Report");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Q3 Report")).toBeVisible();

  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Title").fill("Draft exec summary");
  await page.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByText("Draft exec summary")).toBeVisible();

  await page.getByText("Draft exec summary").click();
  await page.getByLabel("Add an update").fill("Pulled the Q3 numbers.");
  await page.getByText("Post update").click();
  await expect(page.getByText("Pulled the Q3 numbers.")).toBeVisible();
  await page.getByLabel("Close").click();

  const secondEmail = `viewer-${Date.now()}@example.com`;
  const viewerContext = await browser.newContext();
  const viewerPage = await viewerContext.newPage();
  await viewerPage.goto("/signup");
  await viewerPage.getByPlaceholder("Name").fill("Viewer");
  await viewerPage.getByPlaceholder("Email").fill(secondEmail);
  await viewerPage.getByPlaceholder("Password").fill("correcthorse123");
  await viewerPage.getByRole("button", { name: "Sign up" }).click();
  await viewerContext.close();

  await page.getByText("Q3 Report").click();
  await page.getByRole("button", { name: "Share" }).click();
  await page.getByLabel("Email").fill(secondEmail);
  await page.getByLabel("Permission").selectOption("VIEWER");
  await page.getByRole("button", { name: "Share thread" }).click();
  await expect(page.getByText(secondEmail)).toBeVisible();

  await page.getByText("Draft exec summary").click();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByText("Delete").click();

  await page.goto("/recycle-bin");
  await expect(page.getByText("Draft exec summary (task)")).toBeVisible();
  await expect(page.getByText(/permanently deleted 30 days/)).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();

  await page.goto("/canvas");
  await expect(page.getByText("Draft exec summary")).toBeVisible();
});
```

- [ ] **Step 2: Run the end-to-end test**

Run: `npm run test:e2e`
Expected: PASS. If it fails, the failure will point at whichever UI affordance (button/label text) doesn't exist yet in the pages built across Tasks 4–19 — add the missing button/label to the relevant page rather than changing the test, since the test encodes the actual user-facing flow from the approved design.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/foundation-flow.spec.ts
git commit -m "test: add end-to-end regression test for the core Foundation flow"
```

---

## Verification (manual, after all tasks land)

- `npm test` and `npm run test:e2e` both pass in full.
- `npm run dev`, open `/signup`, create an account, and confirm you land on `/canvas`.
- On the canvas: create two threads with different category colors, add a few tasks to each, drag tasks near each other, zoom out past the threshold and confirm thread bubbles appear instead of individual cards, zoom back in and confirm cards return.
- Open a task, add a comment, change its status/priority, confirm both persist after a page reload.
- Share a thread with a second test account as Viewer; log in as that account and confirm you can comment but every edit control is disabled/blocked.
- Delete a task and a thread; visit `/recycle-bin`, confirm both appear with the 30-day note, restore one, confirm it reappears on the canvas.
- Toggle light/dark and pick a few different accent colors via the picker; confirm the glow/contrast still reads correctly in both modes.
- Resize the browser to a mobile width and confirm the canvas drag/zoom/menu interactions still work.
