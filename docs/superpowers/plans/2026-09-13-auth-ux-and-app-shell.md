# Auth UX + App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle signup/login, add a forgot/reset-password flow, and wrap the authenticated routes in a Navbar + Sidebar app shell, all built on a small reusable UI kit.

**Architecture:** A new `components/ui/` kit (Button, Input, Dropdown, FormAlert) styled against the app's existing theme CSS variables; auth pages rebuilt on that kit with a shared `app/(auth)/layout.tsx`; a new `app/(app)/layout.tsx` route group wrapping the existing `canvas`/`recycle-bin` pages with a `Navbar`/`Sidebar` shell; the theme/accent/model controls move out of `Canvas.tsx` into the navbar's `UserMenu`.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, next-auth v5 (credentials provider), Prisma 7 + Postgres, `lucide-react` (new dependency), Vitest + React Testing Library, Playwright.

## Global Constraints

- Preserve exactly, character-for-character: the `"Name"`, `"Email"`, `"Password"` placeholders and the `"Sign up"` button text on the signup page, and the `data-testid="login-form"` / `data-testid="signup-form"` attributes. `tests/e2e/foundation-flow.spec.ts`, `jarvis-flow.spec.ts`, `catchup-flow.spec.ts`, and `ai-prioritization-flow.spec.ts` all depend on these and must not be edited.
- Every new/edited component that reads a theme CSS variable must supply a DARK-mode fallback in the `var()` call itself — `var(--bg, #0a0e14)`, `var(--panel-bg, rgba(15,25,35,0.85))`, `var(--text, #eafcff)`, `var(--accent, #38e0ff)` — matching `lib/theme.ts`'s DARK output and the existing convention in `app/globals.css`'s `.task-card` rule. Without this, the page flashes unstyled before `ThemeProvider`'s client-side effect runs.
- One new dependency: `lucide-react`. No other new runtime dependencies.
- The `(auth)` and `(app)` route groups must not change any URL: `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/canvas`, and `/recycle-bin` all keep their current paths. `middleware.ts`'s matcher (`/canvas/:path*`, `/recycle-bin/:path*`) needs no change.
- Password reset tokens: only the SHA-256 hash is ever persisted (`resetTokenHash`); the raw token exists only in the URL handed back to the caller. 1-hour expiry (`resetTokenExpiresAt`). Single-use — a successful reset clears both columns.
- Schema changes go through Prisma's CLI (`npx prisma migrate dev`) against the `DATABASE_URL` already configured in `.env` — never hand-author migration SQL.
- Test layout follows existing convention: Vitest + React Testing Library in `tests/component/`, Vitest + a real Postgres via `resetDb()` in `tests/integration/`, Playwright in `tests/e2e/`. Run component/integration tests with `npm test -- <path>`, e2e with `npm run test:e2e -- <path>`.

---

### Task 1: `Button` UI primitive

**Files:**
- Modify: `package.json` (add `lucide-react`)
- Create: `components/ui/Button.tsx`
- Test: `tests/component/Button.test.tsx`

**Interfaces:**
- Produces: `export default function Button(props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger"; loading?: boolean })` and `export function buttonClassName(variant?: ButtonVariant, className?: string): string` from `components/ui/Button.tsx`.

- [ ] **Step 1: Install the new dependency**

Run: `npm install lucide-react`
Expected: `package.json` and `package-lock.json` both change; a `lucide-react` entry appears under `dependencies`.

- [ ] **Step 2: Write the failing test**

```tsx
// tests/component/Button.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Button from "@/components/ui/Button";

describe("Button", () => {
  it("renders its children and responds to clicks", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Log in</Button>);

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disables the button and shows a spinner while loading, without firing onClick", () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} loading>
        Submit
      </Button>
    );

    const button = screen.getByRole("button", { name: "Submit" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/component/Button.test.tsx`
Expected: FAIL — `Cannot find module '@/components/ui/Button'`

- [ ] **Step 4: Write the implementation**

```tsx
// components/ui/Button.tsx
"use client";

import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-[var(--accent,#38e0ff)] text-[#04121a] hover:brightness-110",
  secondary:
    "border border-[color:var(--accent,#38e0ff)]/40 text-[var(--text,#eafcff)] hover:bg-[var(--accent,#38e0ff)]/10",
  danger: "bg-red-500/90 text-white hover:bg-red-500",
};

export function buttonClassName(variant: ButtonVariant = "primary", className = ""): string {
  return `${BASE} ${VARIANTS[variant]} ${className}`;
}

export default function Button({
  variant = "primary",
  loading = false,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
}) {
  return (
    <button className={buttonClassName(variant, className)} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/component/Button.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json components/ui/Button.tsx tests/component/Button.test.tsx
git commit -m "feat: add Button UI primitive with lucide-react icons"
```

---

### Task 2: `Input` UI primitive

**Files:**
- Create: `components/ui/Input.tsx`
- Test: `tests/component/Input.test.tsx`

**Interfaces:**
- Produces: `export default function Input(props: InputHTMLAttributes<HTMLInputElement> & { label: string; hideLabel?: boolean; icon?: ReactNode })` from `components/ui/Input.tsx`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/component/Input.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Mail } from "lucide-react";
import Input from "@/components/ui/Input";

describe("Input", () => {
  it("associates the visible label with the field and reports changes", () => {
    const onChange = vi.fn();
    render(<Input name="email" label="Email" icon={<Mail size={16} />} onChange={onChange} />);

    const input = screen.getByLabelText("Email");
    fireEvent.change(input, { target: { value: "a@example.com" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("keeps the label accessible but visually hidden when hideLabel is set", () => {
    render(<Input name="email" label="Email" hideLabel placeholder="Email" />);

    expect(screen.getByLabelText("Email")).toHaveAttribute("placeholder", "Email");
  });

  it("toggles a password field between hidden and visible text", () => {
    render(<Input name="password" type="password" label="Password" />);

    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.type).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input.type).toBe("password");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/component/Input.test.tsx`
Expected: FAIL — `Cannot find module '@/components/ui/Input'`

- [ ] **Step 3: Write the implementation**

```tsx
// components/ui/Input.tsx
"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function Input({
  label,
  hideLabel = false,
  icon,
  className = "",
  type = "text",
  id,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hideLabel?: boolean;
  icon?: ReactNode;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const resolvedType = isPassword && showPassword ? "text" : type;

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label
        htmlFor={inputId}
        className={hideLabel ? "sr-only" : "font-medium text-[var(--text,#eafcff)]"}
      >
        {label}
      </label>
      <span className="relative flex items-center">
        {icon && (
          <span className="pointer-events-none absolute left-3 flex items-center text-[var(--text,#eafcff)]/50">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          type={resolvedType}
          className={`w-full rounded-lg border border-[var(--text,#eafcff)]/15 bg-[var(--panel-bg,rgba(15,25,35,0.85))] py-2 text-[var(--text,#eafcff)] placeholder:text-[var(--text,#eafcff)]/40 outline-none transition-colors focus:border-[var(--accent,#38e0ff)] ${
            icon ? "pl-9" : "pl-3"
          } ${isPassword ? "pr-9" : "pr-3"} ${className}`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((s) => !s)}
            className="absolute right-3 flex items-center text-[var(--text,#eafcff)]/50 hover:text-[var(--text,#eafcff)]"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/component/Input.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add components/ui/Input.tsx tests/component/Input.test.tsx
git commit -m "feat: add Input UI primitive with icon slot and password toggle"
```

---

### Task 3: `FormAlert` UI primitive

**Files:**
- Create: `components/ui/FormAlert.tsx`
- Test: `tests/component/FormAlert.test.tsx`

**Interfaces:**
- Produces: `export default function FormAlert(props: { variant?: "error" | "success"; children: React.ReactNode })` from `components/ui/FormAlert.tsx`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/component/FormAlert.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FormAlert from "@/components/ui/FormAlert";

describe("FormAlert", () => {
  it("renders its message with an alert role", () => {
    render(<FormAlert>Invalid email or password.</FormAlert>);
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid email or password.");
  });

  it("uses a success icon and styling for the success variant", () => {
    render(<FormAlert variant="success">Password updated.</FormAlert>);
    expect(screen.getByRole("alert")).toHaveTextContent("Password updated.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/component/FormAlert.test.tsx`
Expected: FAIL — `Cannot find module '@/components/ui/FormAlert'`

- [ ] **Step 3: Write the implementation**

```tsx
// components/ui/FormAlert.tsx
import { AlertCircle, CheckCircle2 } from "lucide-react";

export default function FormAlert({
  variant = "error",
  children,
}: {
  variant?: "error" | "success";
  children: React.ReactNode;
}) {
  const Icon = variant === "error" ? AlertCircle : CheckCircle2;
  const colorClass =
    variant === "error"
      ? "border-red-500/30 bg-red-500/10 text-red-200"
      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";

  return (
    <div role="alert" className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${colorClass}`}>
      <Icon size={16} className="shrink-0" />
      <span>{children}</span>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/component/FormAlert.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add components/ui/FormAlert.tsx tests/component/FormAlert.test.tsx
git commit -m "feat: add FormAlert UI primitive"
```

---

### Task 4: `Dropdown` UI primitive

**Files:**
- Create: `components/ui/Dropdown.tsx`
- Test: `tests/component/Dropdown.test.tsx`

**Interfaces:**
- Produces: `export default function Dropdown(props: { trigger: (ctx: { open: boolean; toggle: () => void }) => React.ReactNode; children: React.ReactNode; align?: "left" | "right" })` from `components/ui/Dropdown.tsx`.
- Note: intentionally not `role="menu"`/`menuitem` — its content is arbitrary form controls (a color input, a switch, a select), not an actions-only list, so menu/menuitem ARIA semantics would misrepresent it. `components/canvas/CardMenu.tsx` remains the right pattern for actions-only menus.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/component/Dropdown.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Dropdown from "@/components/ui/Dropdown";

describe("Dropdown", () => {
  it("shows children only after the trigger is clicked, and hides them again on outside click", () => {
    render(
      <div>
        <Dropdown trigger={({ toggle }) => <button onClick={toggle}>Open menu</button>}>
          <p>Menu content</p>
        </Dropdown>
        <button>Outside</button>
      </div>
    );

    expect(screen.queryByText("Menu content")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Open menu"));
    expect(screen.getByText("Menu content")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByText("Outside"));
    expect(screen.queryByText("Menu content")).not.toBeInTheDocument();
  });

  it("closes on Escape", () => {
    render(
      <Dropdown trigger={({ toggle }) => <button onClick={toggle}>Open menu</button>}>
        <p>Menu content</p>
      </Dropdown>
    );

    fireEvent.click(screen.getByText("Open menu"));
    expect(screen.getByText("Menu content")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Menu content")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/component/Dropdown.test.tsx`
Expected: FAIL — `Cannot find module '@/components/ui/Dropdown'`

- [ ] **Step 3: Write the implementation**

```tsx
// components/ui/Dropdown.tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export default function Dropdown({
  trigger,
  children,
  align = "right",
}: {
  trigger: (ctx: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          className={`absolute z-30 mt-2 w-64 rounded-lg border border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] p-2 shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/component/Dropdown.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add components/ui/Dropdown.tsx tests/component/Dropdown.test.tsx
git commit -m "feat: add Dropdown UI primitive"
```

---

### Task 5: Password-reset data model

**Files:**
- Modify: `prisma/schema.prisma` (`User` model)
- Modify: `lib/auth-errors.ts`
- Test: `tests/integration/schema-passwordReset.test.ts`

**Interfaces:**
- Produces: `User.resetTokenHash: string | null`, `User.resetTokenExpiresAt: Date | null` on the Prisma client; `export class PasswordResetError extends Error {}` from `lib/auth-errors.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/schema-passwordReset.test.ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";

describe("Prisma schema — password reset fields", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  it("defaults resetTokenHash and resetTokenExpiresAt to null", async () => {
    const user = await db.user.create({
      data: { email: "reset-schema@example.com", passwordHash: "x", name: "Res" },
    });

    expect(user.resetTokenHash).toBeNull();
    expect(user.resetTokenExpiresAt).toBeNull();
  });

  it("stores a reset token hash and expiry on a user", async () => {
    const user = await db.user.create({
      data: { email: "reset-schema2@example.com", passwordHash: "x", name: "Res" },
    });
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const updated = await db.user.update({
      where: { id: user.id },
      data: { resetTokenHash: "a".repeat(64), resetTokenExpiresAt: expiresAt },
    });

    expect(updated.resetTokenHash).toBe("a".repeat(64));
    expect(updated.resetTokenExpiresAt).toEqual(expiresAt);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/schema-passwordReset.test.ts`
Expected: FAIL — TypeScript error / Prisma error, `resetTokenHash` does not exist on the `User` create/update input.

- [ ] **Step 3: Edit the schema**

In `prisma/schema.prisma`, in the `User` model, add the two new fields right after `preferredAiModel`:

```prisma
model User {
  id               String    @id @default(cuid())
  email            String    @unique
  passwordHash     String
  name             String
  themeMode        ThemeMode @default(DARK)
  accentColor      String    @default("#38e0ff")
  preferredAiModel String    @default("gemini-3.8-flash")
  resetTokenHash      String?
  resetTokenExpiresAt DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  ownedThreads   Thread[]       @relation("ThreadOwner")
  taskUpdates    TaskUpdate[]
  taskPositions  TaskPosition[]
  sharesReceived ThreadShare[]  @relation("ShareRecipient")
  threadViews    ThreadView[]
  jarvisMessages JarvisMessage[]
}
```

- [ ] **Step 4: Add `PasswordResetError`**

```ts
// lib/auth-errors.ts
export class SignupError extends Error {}
export class PasswordResetError extends Error {}
```

- [ ] **Step 5: Run the migration**

Run: `npx prisma migrate dev --name add_password_reset_token`
Expected: Prisma reports the migration was created under `prisma/migrations/<timestamp>_add_password_reset_token/` and applied; "Your database is now in sync with your schema." The Prisma Client is regenerated.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/integration/schema-passwordReset.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/auth-errors.ts tests/integration/schema-passwordReset.test.ts
git commit -m "feat: add resetTokenHash/resetTokenExpiresAt to User for password reset"
```

---

### Task 6: `requestPasswordReset` server action

**Files:**
- Modify: `app/actions/auth.ts`
- Modify: `tests/integration/auth.test.ts`

**Design note (post-Task-6-review correction):** the first version of this
task returned `{ resetUrl: null }` for an unknown email and a real URL for a
known one. Since a `"use server"` action is a directly callable network
endpoint (not only reachable through the UI), that response shape was
itself a user-enumeration oracle — a caller could submit any email and read
`resetUrl`'s nullness to learn whether an account exists, violating this
plan's own "no user enumeration" constraint. Fixed by always returning a
URL-shaped response: for an unknown email, a token is generated but never
stored, so the resulting link is syntactically identical but simply won't
validate later in `resetPassword()` — same as any other garbage token.
`resetUrl` is therefore never `null` in the corrected design; the type
below reflects that. A residual response-time difference remains (the
known-email path does one extra `db.user.update`) — accepted for this
dev-only project rather than engineered away with constant-time padding,
since closing the response-shape oracle is the change that matters here.

**Interfaces:**
- Consumes: `PasswordResetError` from `lib/auth-errors.ts` (Task 5).
- Produces: `export async function requestPasswordReset(email: string): Promise<{ resetUrl: string }>` from `app/actions/auth.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/integration/auth.test.ts`, and add `requestPasswordReset` to the existing import line:

```ts
import { signup, SignupError, requestPasswordReset } from "@/app/actions/auth";
```

```ts
describe("requestPasswordReset", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  it("returns a reset URL containing a token for an existing account, storing only its hash", async () => {
    await signup({ email: "reset@example.com", password: "correcthorse", name: "Reese" });

    const { resetUrl } = await requestPasswordReset("Reset@Example.com");

    expect(resetUrl).toMatch(/^\/reset-password\?token=[0-9a-f]{64}$/);
    const user = await db.user.findUniqueOrThrow({ where: { email: "reset@example.com" } });
    expect(user.resetTokenHash).not.toBeNull();
    expect(user.resetTokenExpiresAt).not.toBeNull();
    const token = new URL(resetUrl, "http://x").searchParams.get("token")!;
    expect(user.resetTokenHash).not.toBe(token);
  });

  it("returns an equally URL-shaped response for an unknown email, without creating a user or storing a token", async () => {
    const { resetUrl } = await requestPasswordReset("nobody@example.com");

    expect(resetUrl).toMatch(/^\/reset-password\?token=[0-9a-f]{64}$/);
    const user = await db.user.findUnique({ where: { email: "nobody@example.com" } });
    expect(user).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/auth.test.ts`
Expected: FAIL — `requestPasswordReset` is not exported by `@/app/actions/auth`.

- [ ] **Step 3: Write the implementation**

```ts
// app/actions/auth.ts
"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { SignupError, PasswordResetError } from "@/lib/auth-errors";

export { SignupError, PasswordResetError };

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

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

function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function requestPasswordReset(email: string): Promise<{ resetUrl: string }> {
  const normalized = email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email: normalized } });

  const token = crypto.randomBytes(32).toString("hex");

  if (user) {
    await db.user.update({
      where: { id: user.id },
      data: {
        resetTokenHash: hashResetToken(token),
        resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
  }

  // Always return a URL-shaped response, even for an unknown email —
  // returning null only in that case would make this response itself a
  // user-enumeration oracle, since a Server Action is a directly callable
  // network endpoint, not something reached only through the UI. For an
  // unknown email, `token` is generated but never stored, so the resulting
  // link simply won't validate in resetPassword() — same as any other
  // garbage token.
  //
  // Dev-mode convenience: no email provider is configured in this project
  // (see .env.example), so the reset link is handed back to the caller to
  // display directly instead of being emailed. Only the token's hash is
  // ever persisted; the raw token lives only in this returned URL.
  return { resetUrl: `/reset-password?token=${token}` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/auth.test.ts`
Expected: PASS (all `signup` and `requestPasswordReset` tests)

- [ ] **Step 5: Commit**

```bash
git add app/actions/auth.ts tests/integration/auth.test.ts
git commit -m "feat: add requestPasswordReset server action"
```

---

### Task 7: `resetPassword` server action

**Files:**
- Modify: `app/actions/auth.ts`
- Modify: `tests/integration/auth.test.ts`

**Interfaces:**
- Consumes: `requestPasswordReset` (Task 6), `PasswordResetError` (Task 5).
- Produces: `export async function resetPassword(token: string, newPassword: string): Promise<void>` from `app/actions/auth.ts`.

- [ ] **Step 1: Write the failing tests**

Update the import line in `tests/integration/auth.test.ts` once more:

```ts
import { signup, SignupError, requestPasswordReset, resetPassword, PasswordResetError } from "@/app/actions/auth";
```

```ts
describe("resetPassword", () => {
  beforeEach(resetDb);
  afterAll(async () => db.$disconnect());

  async function requestToken(email: string): Promise<string> {
    const { resetUrl } = await requestPasswordReset(email);
    return new URL(resetUrl!, "http://x").searchParams.get("token")!;
  }

  it("updates the password and clears the token", async () => {
    await signup({ email: "reset2@example.com", password: "oldpassword", name: "Reese" });
    const token = await requestToken("reset2@example.com");

    await resetPassword(token, "newpassword123");

    const user = await db.user.findUniqueOrThrow({ where: { email: "reset2@example.com" } });
    expect(await bcrypt.compare("newpassword123", user.passwordHash)).toBe(true);
    expect(user.resetTokenHash).toBeNull();
    expect(user.resetTokenExpiresAt).toBeNull();
  });

  it("rejects an unknown token", async () => {
    await expect(resetPassword("not-a-real-token", "newpassword123")).rejects.toThrow(PasswordResetError);
  });

  it("rejects a token that has already expired", async () => {
    await signup({ email: "reset3@example.com", password: "oldpassword", name: "Reese" });
    const token = await requestToken("reset3@example.com");
    await db.user.update({
      where: { email: "reset3@example.com" },
      data: { resetTokenExpiresAt: new Date(Date.now() - 1000) },
    });

    await expect(resetPassword(token, "newpassword123")).rejects.toThrow(PasswordResetError);
  });

  it("rejects a password shorter than 8 characters", async () => {
    await signup({ email: "reset4@example.com", password: "oldpassword", name: "Reese" });
    const token = await requestToken("reset4@example.com");

    await expect(resetPassword(token, "short")).rejects.toThrow(PasswordResetError);
  });

  it("rejects reusing an already-consumed token", async () => {
    await signup({ email: "reset5@example.com", password: "oldpassword", name: "Reese" });
    const token = await requestToken("reset5@example.com");
    await resetPassword(token, "newpassword123");

    await expect(resetPassword(token, "anotherpassword123")).rejects.toThrow(PasswordResetError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/auth.test.ts`
Expected: FAIL — `resetPassword` is not exported by `@/app/actions/auth`.

- [ ] **Step 3: Write the implementation**

Append to `app/actions/auth.ts`:

```ts
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  if (newPassword.length < 8) {
    throw new PasswordResetError("Password must be at least 8 characters.");
  }

  const user = await db.user.findFirst({ where: { resetTokenHash: hashResetToken(token) } });
  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    throw new PasswordResetError("This reset link is invalid or has expired.");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash, resetTokenHash: null, resetTokenExpiresAt: null },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/auth.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add app/actions/auth.ts tests/integration/auth.test.ts
git commit -m "feat: add resetPassword server action"
```

---

### Task 8: Auth layout + restyled login page

**Files:**
- Create: `app/(auth)/layout.tsx`
- Modify: `app/(auth)/login/page.tsx`
- Test: `tests/component/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `Button` (Task 1), `Input` (Task 2), `FormAlert` (Task 3).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/component/LoginPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginPage from "@/app/(auth)/login/page";
import { signIn } from "next-auth/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

beforeEach(() => {
  push.mockReset();
  vi.mocked(signIn).mockReset();
});

describe("LoginPage", () => {
  it("logs in and redirects to /canvas on success", async () => {
    vi.mocked(signIn).mockResolvedValue({ error: undefined } as never);
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "correcthorse123" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/canvas"));
  });

  it("shows an error message and does not redirect when signIn fails", async () => {
    vi.mocked(signIn).mockResolvedValue({ error: "CredentialsSignin" } as never);
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/component/LoginPage.test.tsx`
Expected: FAIL — the restyled markup/button don't exist yet (current page has no accessible "Log in" button issue is fine, it's the missing Input/FormAlert integration and `role="alert"` text that fails).

- [ ] **Step 3: Write the auth layout**

```tsx
// app/(auth)/layout.tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-[var(--bg,#0a0e14)] p-6">
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Restyle the login page**

```tsx
// app/(auth)/login/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Mail, Lock } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import FormAlert from "@/components/ui/FormAlert";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSubmitting(true);
    const result = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    });
    if (result?.error) {
      setError("Invalid email or password.");
      setSubmitting(false);
      return;
    }
    router.push("/canvas");
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] p-8 shadow-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-[var(--text,#eafcff)]">Log in</h1>
      <form action={handleSubmit} data-testid="login-form" className="flex flex-col gap-4">
        <Input
          name="email"
          type="email"
          placeholder="Email"
          label="Email"
          hideLabel
          icon={<Mail size={16} />}
          required
        />
        <Input
          name="password"
          type="password"
          placeholder="Password"
          label="Password"
          hideLabel
          icon={<Lock size={16} />}
          required
        />
        <Link href="/forgot-password" className="self-end text-xs text-[var(--accent,#38e0ff)] hover:underline">
          Forgot password?
        </Link>
        <Button type="submit" loading={submitting}>
          Log in
        </Button>
        {error && <FormAlert>{error}</FormAlert>}
      </form>
      <p className="mt-6 text-center text-sm text-[var(--text,#eafcff)]/60">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-[var(--accent,#38e0ff)] hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/component/LoginPage.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add "app/(auth)/layout.tsx" "app/(auth)/login/page.tsx" tests/component/LoginPage.test.tsx
git commit -m "feat: restyle login page with the new UI kit and add an auth layout"
```

---

### Task 9: Restyled signup page

**Files:**
- Modify: `app/(auth)/signup/page.tsx`
- Test: `tests/component/SignupPage.test.tsx`

**Interfaces:**
- Consumes: `Button`, `Input`, `FormAlert` (Tasks 1-3), `app/(auth)/layout.tsx` (Task 8, no changes needed — it already wraps this page).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/component/SignupPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SignupPage from "@/app/(auth)/signup/page";
import { signIn } from "next-auth/react";
import { signup } from "@/app/actions/auth";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
vi.mock("@/app/actions/auth", () => ({ signup: vi.fn() }));

beforeEach(() => {
  push.mockReset();
  vi.mocked(signIn).mockReset();
  vi.mocked(signup).mockReset();
});

describe("SignupPage", () => {
  it("signs up, signs in, and redirects to /canvas on success", async () => {
    vi.mocked(signup).mockResolvedValue({ id: "u1", email: "a@example.com" });
    vi.mocked(signIn).mockResolvedValue({ error: undefined } as never);
    render(<SignupPage />);

    fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Ann" } });
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "correcthorse123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/canvas"));
  });

  it("shows an error message when signup rejects", async () => {
    vi.mocked(signup).mockRejectedValue(new Error("An account with this email already exists."));
    render(<SignupPage />);

    fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Ann" } });
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "correcthorse123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An account with this email already exists."
    );
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/component/SignupPage.test.tsx`
Expected: FAIL — no `role="alert"` FormAlert integration yet.

- [ ] **Step 3: Write the implementation**

```tsx
// app/(auth)/signup/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { User, Mail, Lock } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import FormAlert from "@/components/ui/FormAlert";
import { signup } from "@/app/actions/auth";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSubmitting(true);
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
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] p-8 shadow-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-[var(--text,#eafcff)]">Sign up</h1>
      <form action={handleSubmit} data-testid="signup-form" className="flex flex-col gap-4">
        <Input name="name" placeholder="Name" label="Name" hideLabel icon={<User size={16} />} required />
        <Input
          name="email"
          type="email"
          placeholder="Email"
          label="Email"
          hideLabel
          icon={<Mail size={16} />}
          required
        />
        <Input
          name="password"
          type="password"
          placeholder="Password"
          label="Password"
          hideLabel
          icon={<Lock size={16} />}
          required
        />
        <Button type="submit" loading={submitting}>
          Sign up
        </Button>
        {error && <FormAlert>{error}</FormAlert>}
      </form>
      <p className="mt-6 text-center text-sm text-[var(--text,#eafcff)]/60">
        Already have an account?{" "}
        <Link href="/login" className="text-[var(--accent,#38e0ff)] hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/component/SignupPage.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the existing e2e regression for signup**

Run: `npm run test:e2e -- tests/e2e/foundation-flow.spec.ts`
Expected: PASS — placeholders/testid/button text are unchanged, so the existing flow still works.

- [ ] **Step 6: Commit**

```bash
git add "app/(auth)/signup/page.tsx" tests/component/SignupPage.test.tsx
git commit -m "feat: restyle signup page with the new UI kit"
```

---

### Task 10: Forgot-password page

**Files:**
- Create: `app/(auth)/forgot-password/page.tsx`
- Test: `tests/component/ForgotPasswordPage.test.tsx`

**Interfaces:**
- Consumes: `requestPasswordReset` (Task 6, now `Promise<{ resetUrl: string }>` — never null, per Task 6's post-review correction), `Button`/`Input` (Tasks 1-2).

**Design note:** because `requestPasswordReset` always returns a URL-shaped
response now (never null — see Task 6), this page must render identically
regardless of whether the account exists. It always shows the dev-mode link
box; it never branches on `resetUrl` being present, since that branch is
exactly the enumeration channel Task 6's fix closed at the server. Showing
the same UI unconditionally is what makes the fix actually effective end to
end.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/component/ForgotPasswordPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";
import { requestPasswordReset } from "@/app/actions/auth";

vi.mock("@/app/actions/auth", () => ({ requestPasswordReset: vi.fn() }));

beforeEach(() => {
  vi.mocked(requestPasswordReset).mockReset();
});

describe("ForgotPasswordPage", () => {
  it("shows the dev-mode reset link after submitting", async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue({ resetUrl: "/reset-password?token=abc123" });
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("link", { name: "/reset-password?token=abc123" })).toBeInTheDocument();
    expect(requestPasswordReset).toHaveBeenCalledWith("a@example.com");
  });

  it("shows the identical link UI even for an email with no account (the response gives no indication either way)", async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue({ resetUrl: "/reset-password?token=deadbeef" });
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "nobody@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("link", { name: "/reset-password?token=deadbeef" })).toBeInTheDocument();
    expect(screen.getByText(/a password reset link has been generated/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/component/ForgotPasswordPage.test.tsx`
Expected: FAIL — `Cannot find module '@/app/(auth)/forgot-password/page'`

- [ ] **Step 3: Write the implementation**

```tsx
// app/(auth)/forgot-password/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { requestPasswordReset } from "@/app/actions/auth";

export default function ForgotPasswordPage() {
  const [submitting, setSubmitting] = useState(false);
  const [resetUrl, setResetUrl] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    const result = await requestPasswordReset(String(formData.get("email")));
    setResetUrl(result.resetUrl);
    setSubmitting(false);
  }

  if (resetUrl) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] p-8 shadow-2xl">
        <h1 className="mb-4 text-2xl font-semibold text-[var(--text,#eafcff)]">Check your email</h1>
        <p className="text-sm text-[var(--text,#eafcff)]/70">
          If an account exists for that email, a password reset link has been generated.
        </p>
        <div className="mt-4 rounded-lg border border-[var(--accent,#38e0ff)]/30 bg-[var(--accent,#38e0ff)]/10 p-3 text-sm text-[var(--text,#eafcff)]">
          <p className="mb-1 font-medium">Dev mode — no email provider is configured:</p>
          <Link href={resetUrl} className="break-all text-[var(--accent,#38e0ff)] underline">
            {resetUrl}
          </Link>
        </div>
        <p className="mt-6 text-center text-sm text-[var(--text,#eafcff)]/60">
          <Link href="/login" className="text-[var(--accent,#38e0ff)] hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] p-8 shadow-2xl">
      <h1 className="mb-2 text-2xl font-semibold text-[var(--text,#eafcff)]">Forgot password</h1>
      <p className="mb-6 text-sm text-[var(--text,#eafcff)]/60">
        Enter your email and we&apos;ll generate a reset link.
      </p>
      <form action={handleSubmit} data-testid="forgot-password-form" className="flex flex-col gap-4">
        <Input name="email" type="email" placeholder="you@example.com" label="Email" icon={<Mail size={16} />} required />
        <Button type="submit" loading={submitting}>
          Send reset link
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-[var(--text,#eafcff)]/60">
        <Link href="/login" className="text-[var(--accent,#38e0ff)] hover:underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/component/ForgotPasswordPage.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(auth)/forgot-password/page.tsx" tests/component/ForgotPasswordPage.test.tsx
git commit -m "feat: add forgot-password page"
```

---

### Task 11: Reset-password page

**Files:**
- Create: `app/(auth)/reset-password/page.tsx`
- Test: `tests/component/ResetPasswordPage.test.tsx`

**Interfaces:**
- Consumes: `resetPassword` (Task 7), `Button` (incl. `buttonClassName`, Task 1), `Input` (Task 2), `FormAlert` (Task 3).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/component/ResetPasswordPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Suspense } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ResetPasswordPage from "@/app/(auth)/reset-password/page";
import { resetPassword } from "@/app/actions/auth";

vi.mock("@/app/actions/auth", () => ({ resetPassword: vi.fn() }));

function renderPage(token: string | undefined) {
  return render(
    <Suspense fallback={null}>
      <ResetPasswordPage searchParams={Promise.resolve({ token })} />
    </Suspense>
  );
}

beforeEach(() => {
  vi.mocked(resetPassword).mockReset();
});

describe("ResetPasswordPage", () => {
  it("resets the password and shows a success view", async () => {
    vi.mocked(resetPassword).mockResolvedValue(undefined);
    renderPage("abc123");

    fireEvent.change(await screen.findByLabelText("New password"), { target: { value: "newpassword123" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "newpassword123" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith("abc123", "newpassword123"));
    expect(await screen.findByText("Password updated")).toBeInTheDocument();
  });

  it("shows an error and does not call resetPassword when the passwords don't match", async () => {
    renderPage("abc123");

    fireEvent.change(await screen.findByLabelText("New password"), { target: { value: "newpassword123" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "different" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match.");
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("shows the server's error message when the token is invalid or expired", async () => {
    vi.mocked(resetPassword).mockRejectedValue(new Error("This reset link is invalid or has expired."));
    renderPage("bad-token");

    fireEvent.change(await screen.findByLabelText("New password"), { target: { value: "newpassword123" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "newpassword123" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This reset link is invalid or has expired.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/component/ResetPasswordPage.test.tsx`
Expected: FAIL — `Cannot find module '@/app/(auth)/reset-password/page'`

- [ ] **Step 3: Write the implementation**

Per this project's own bundled Next.js 16 docs (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`), a `"use client"` page unwraps the async `searchParams` prop with React's `use()` hook:

```tsx
// app/(auth)/reset-password/page.tsx
"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import Button, { buttonClassName } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import FormAlert from "@/components/ui/FormAlert";
import { resetPassword } from "@/app/actions/auth";

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = use(searchParams);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    const password = String(formData.get("password"));
    const confirmPassword = String(formData.get("confirmPassword"));
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!token) {
      setError("This reset link is missing its token.");
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset your password.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] p-8 shadow-2xl">
        <h1 className="mb-4 text-2xl font-semibold text-[var(--text,#eafcff)]">Password updated</h1>
        <p className="mb-6 text-sm text-[var(--text,#eafcff)]/70">
          Your password has been reset. You can log in with your new password now.
        </p>
        <Link href="/login" className={buttonClassName("primary", "w-full")}>
          Go to log in
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] p-8 shadow-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-[var(--text,#eafcff)]">Reset password</h1>
      <form action={handleSubmit} data-testid="reset-password-form" className="flex flex-col gap-4">
        <Input name="password" type="password" placeholder="New password" label="New password" icon={<Lock size={16} />} required />
        <Input
          name="confirmPassword"
          type="password"
          placeholder="Confirm new password"
          label="Confirm new password"
          icon={<Lock size={16} />}
          required
        />
        <Button type="submit" loading={submitting}>
          Reset password
        </Button>
        {error && <FormAlert>{error}</FormAlert>}
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/component/ResetPasswordPage.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(auth)/reset-password/page.tsx" tests/component/ResetPasswordPage.test.tsx
git commit -m "feat: add reset-password page"
```

---

### Task 12: `Sidebar` shell component

**Files:**
- Create: `components/shell/Sidebar.tsx`
- Test: `tests/component/Sidebar.test.tsx`

**Interfaces:**
- Produces: `export default function Sidebar(): JSX.Element` from `components/shell/Sidebar.tsx`. No props — reads the route from `usePathname()`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/component/Sidebar.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Sidebar from "@/components/shell/Sidebar";

const mockPathname = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname() }));

describe("Sidebar", () => {
  it("renders Canvas and Recycle Bin links", () => {
    mockPathname.mockReturnValue("/canvas");
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: /Canvas/ })).toHaveAttribute("href", "/canvas");
    expect(screen.getByRole("link", { name: /Recycle Bin/ })).toHaveAttribute("href", "/recycle-bin");
  });

  it("marks the link matching the current route as the current page", () => {
    mockPathname.mockReturnValue("/recycle-bin");
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: /Recycle Bin/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Canvas/ })).not.toHaveAttribute("aria-current");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/component/Sidebar.test.tsx`
Expected: FAIL — `Cannot find module '@/components/shell/Sidebar'`

- [ ] **Step 3: Write the implementation**

```tsx
// components/shell/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Trash2 } from "lucide-react";

const NAV_ITEMS = [
  { href: "/canvas", label: "Canvas", icon: LayoutGrid },
  { href: "/recycle-bin", label: "Recycle Bin", icon: Trash2 },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="flex w-56 shrink-0 flex-col gap-1 border-r border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] p-3"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-[var(--accent,#38e0ff)]/15 text-[var(--accent,#38e0ff)]"
                : "text-[var(--text,#eafcff)]/70 hover:bg-[var(--text,#eafcff)]/5 hover:text-[var(--text,#eafcff)]"
            }`}
          >
            <Icon size={18} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/component/Sidebar.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add components/shell/Sidebar.tsx tests/component/Sidebar.test.tsx
git commit -m "feat: add Sidebar shell component"
```

---

### Task 13: `UserMenu` shell component (absorbs the theme/accent/model controls)

**Files:**
- Modify: `components/settings/ThemeToggle.tsx`
- Modify: `components/settings/AccentColorPicker.tsx`
- Modify: `components/settings/ModelPicker.tsx`
- Create: `components/shell/UserMenu.tsx`
- Test: `tests/component/UserMenu.test.tsx`

**Interfaces:**
- Consumes: `Dropdown` (Task 4), `updateThemePreference` (`app/actions/theme.ts`, unchanged), `updatePreferredAiModel` (`app/actions/aiModel.ts`, unchanged), `themeToCssVariables` (`lib/theme.ts`, unchanged).
- Produces: `export default function UserMenu(props: { name: string; email: string; themeMode: "LIGHT" | "DARK"; accentColor: string; preferredAiModel: string })` from `components/shell/UserMenu.tsx`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/component/UserMenu.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UserMenu from "@/components/shell/UserMenu";
import { updateThemePreference } from "@/app/actions/theme";
import { updatePreferredAiModel } from "@/app/actions/aiModel";
import { signOut } from "next-auth/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/theme", () => ({ updateThemePreference: vi.fn() }));
vi.mock("@/app/actions/aiModel", () => ({ updatePreferredAiModel: vi.fn() }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

const defaultProps = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  themeMode: "DARK" as const,
  accentColor: "#38e0ff",
  preferredAiModel: "gemini-3.8-flash",
};

beforeEach(() => {
  vi.mocked(updateThemePreference).mockReset();
  vi.mocked(updatePreferredAiModel).mockReset();
  vi.mocked(signOut).mockReset();
});

describe("UserMenu", () => {
  it("shows the user's name and email once opened", () => {
    render(<UserMenu {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "User menu" }));
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
  });

  it("calls updateThemePreference and applies the accent color immediately when the color picker changes", async () => {
    render(<UserMenu {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "User menu" }));

    fireEvent.change(screen.getByLabelText("Accent color"), { target: { value: "#ff5fa8" } });

    await waitFor(() => expect(updateThemePreference).toHaveBeenCalledWith("DARK", "#ff5fa8"));
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#ff5fa8");
  });

  it("calls updateThemePreference with the toggled mode when the theme toggle is clicked", async () => {
    render(<UserMenu {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "User menu" }));

    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => expect(updateThemePreference).toHaveBeenCalledWith("LIGHT", "#38e0ff"));
  });

  it("calls updatePreferredAiModel when the model picker changes", async () => {
    render(<UserMenu {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "User menu" }));

    fireEvent.change(screen.getByLabelText("AI model"), { target: { value: "gemini-3.1-pro-preview" } });

    await waitFor(() => expect(updatePreferredAiModel).toHaveBeenCalledWith("gemini-3.1-pro-preview"));
  });

  it("calls signOut with a redirect to /login when Log out is clicked", () => {
    render(<UserMenu {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "User menu" }));

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/component/UserMenu.test.tsx`
Expected: FAIL — `Cannot find module '@/components/shell/UserMenu'`

- [ ] **Step 3: Restyle the three settings components** (behavior identical, only markup/classes change — every existing assertion in `ThemeToggle.test.tsx`, `AccentColorPicker.test.tsx`, and `ModelPicker.test.tsx` keeps passing because all `aria-label`/`role` attributes are preserved)

```tsx
// components/settings/ThemeToggle.tsx
"use client";

import { Moon, Sun } from "lucide-react";

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
      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--text,#eafcff)] hover:bg-[var(--text,#eafcff)]/5"
    >
      {value === "DARK" ? <Moon size={16} /> : <Sun size={16} />}
      {value === "DARK" ? "Dark" : "Light"}
    </button>
  );
}
```

```tsx
// components/settings/AccentColorPicker.tsx
"use client";

export default function AccentColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm text-[var(--text,#eafcff)]">
      <span>Accent color</span>
      <input
        aria-label="Accent color"
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-10 cursor-pointer rounded border border-[var(--text,#eafcff)]/15 bg-transparent p-0.5"
      />
    </label>
  );
}
```

```tsx
// components/settings/ModelPicker.tsx
"use client";

import { useState } from "react";

const PRESET_MODELS = ["gemini-3.8-flash", "gemini-3.1-pro-preview"] as const;
const CUSTOM_OPTION = "custom";

function isPresetModel(value: string): boolean {
  return (PRESET_MODELS as readonly string[]).includes(value);
}

const fieldClassName =
  "rounded-lg border border-[var(--text,#eafcff)]/15 bg-transparent px-2 py-1 text-sm text-[var(--text,#eafcff)] outline-none focus:border-[var(--accent,#38e0ff)]";

export default function ModelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (model: string) => void;
}) {
  const preset = isPresetModel(value);
  const [customText, setCustomText] = useState(preset ? "" : value);
  // Whether the user has explicitly switched the select to "Custom…" this
  // render session. Kept separate from `preset` (which is derived from the
  // controlled `value` prop) because switching to Custom must reveal the
  // input WITHOUT calling onChange: customText starts out empty at that
  // point, and calling onChange("") used to fire updatePreferredAiModel("")
  // — which throws ("Model id must not be empty.") as an unhandled
  // rejection, since the call isn't awaited/caught by the caller.
  const [customSelected, setCustomSelected] = useState(!preset);

  const showCustomInput = preset ? customSelected : true;

  return (
    <div className="flex flex-col gap-1.5 text-sm text-[var(--text,#eafcff)]">
      <label className="flex items-center justify-between gap-2">
        AI model
        <select
          aria-label="AI model"
          value={showCustomInput ? CUSTOM_OPTION : value}
          onChange={(e) => {
            if (e.target.value === CUSTOM_OPTION) {
              setCustomSelected(true);
            } else {
              setCustomSelected(false);
              onChange(e.target.value);
            }
          }}
          className={fieldClassName}
        >
          {PRESET_MODELS.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
          <option value={CUSTOM_OPTION}>Custom…</option>
        </select>
      </label>
      {showCustomInput && (
        <input
          aria-label="Custom model ID"
          value={customText}
          onChange={(e) => {
            const next = e.target.value;
            setCustomText(next);
            if (next.trim() !== "") {
              onChange(next);
            }
          }}
          className={fieldClassName}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write `UserMenu`**

```tsx
// components/shell/UserMenu.tsx
"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import Dropdown from "@/components/ui/Dropdown";
import AccentColorPicker from "@/components/settings/AccentColorPicker";
import ThemeToggle from "@/components/settings/ThemeToggle";
import ModelPicker from "@/components/settings/ModelPicker";
import { themeToCssVariables } from "@/lib/theme";
import { updateThemePreference } from "@/app/actions/theme";
import { updatePreferredAiModel } from "@/app/actions/aiModel";

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export default function UserMenu({
  name,
  email,
  themeMode,
  accentColor,
  preferredAiModel,
}: {
  name: string;
  email: string;
  themeMode: "LIGHT" | "DARK";
  accentColor: string;
  preferredAiModel: string;
}) {
  const router = useRouter();
  const [localThemeMode, setLocalThemeMode] = useState(themeMode);
  const [localAccentColor, setLocalAccentColor] = useState(accentColor);
  const [aiModel, setAiModel] = useState(preferredAiModel);

  // Moved here from components/canvas/Canvas.tsx, which used to own this
  // settings strip directly. Applies the CSS variables immediately (so the
  // change is visible without waiting on the Server Action + router.refresh()
  // round-trip that reconciles the root layout's own ThemeProvider props),
  // then persists the preference and refreshes for later navigations.
  const handleThemeChange = useCallback(
    async (mode: "LIGHT" | "DARK", color: string) => {
      setLocalThemeMode(mode);
      setLocalAccentColor(color);
      const vars = themeToCssVariables(mode, color);
      for (const [key, value] of Object.entries(vars)) {
        document.documentElement.style.setProperty(key, value);
      }
      await updateThemePreference(mode, color);
      router.refresh();
    },
    [router]
  );

  return (
    <Dropdown
      trigger={({ toggle }) => (
        <button
          aria-label="User menu"
          onClick={toggle}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent,#38e0ff)]/20 text-sm font-semibold text-[var(--accent,#38e0ff)]"
        >
          {initialsOf(name)}
        </button>
      )}
    >
      <div className="mb-2 border-b border-[var(--text,#eafcff)]/10 px-2 pb-2">
        <p className="text-sm font-medium text-[var(--text,#eafcff)]">{name}</p>
        <p className="text-xs text-[var(--text,#eafcff)]/60">{email}</p>
      </div>
      <div className="flex flex-col gap-3 px-2 py-1">
        <AccentColorPicker value={localAccentColor} onChange={(hex) => handleThemeChange(localThemeMode, hex)} />
        <ThemeToggle value={localThemeMode} onChange={(mode) => handleThemeChange(mode, localAccentColor)} />
        <ModelPicker
          value={aiModel}
          onChange={async (model) => {
            setAiModel(model);
            await updatePreferredAiModel(model);
          }}
        />
      </div>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-red-300 hover:bg-red-500/10"
      >
        <LogOut size={16} />
        Log out
      </button>
    </Dropdown>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/component/UserMenu.test.tsx tests/component/ThemeToggle.test.tsx tests/component/AccentColorPicker.test.tsx tests/component/ModelPicker.test.tsx`
Expected: PASS (all tests in all four files — the three existing settings-component tests are unaffected by the restyle)

- [ ] **Step 6: Commit**

```bash
git add components/settings/ThemeToggle.tsx components/settings/AccentColorPicker.tsx components/settings/ModelPicker.tsx components/shell/UserMenu.tsx tests/component/UserMenu.test.tsx
git commit -m "feat: add UserMenu shell component, restyle theme/accent/model controls"
```

---

### Task 14: `Navbar` shell component

**Files:**
- Create: `components/shell/Navbar.tsx`
- Test: `tests/component/Navbar.test.tsx`

**Interfaces:**
- Consumes: `UserMenu` (Task 13).
- Produces: `export default function Navbar(props: { name: string; email: string; themeMode: "LIGHT" | "DARK"; accentColor: string; preferredAiModel: string })` from `components/shell/Navbar.tsx`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/component/Navbar.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Navbar from "@/components/shell/Navbar";

const defaultProps = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  themeMode: "DARK" as const,
  accentColor: "#38e0ff",
  preferredAiModel: "gemini-3.8-flash",
};

describe("Navbar", () => {
  it("renders the app name and a user menu trigger", () => {
    render(<Navbar {...defaultProps} />);
    expect(screen.getByText("Arc")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "User menu" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/component/Navbar.test.tsx`
Expected: FAIL — `Cannot find module '@/components/shell/Navbar'`

- [ ] **Step 3: Write the implementation**

```tsx
// components/shell/Navbar.tsx
import UserMenu from "./UserMenu";

export default function Navbar({
  name,
  email,
  themeMode,
  accentColor,
  preferredAiModel,
}: {
  name: string;
  email: string;
  themeMode: "LIGHT" | "DARK";
  accentColor: string;
  preferredAiModel: string;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] px-4">
      <span className="text-sm font-semibold tracking-wide text-[var(--text,#eafcff)]">Arc</span>
      <UserMenu name={name} email={email} themeMode={themeMode} accentColor={accentColor} preferredAiModel={preferredAiModel} />
    </header>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/component/Navbar.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add components/shell/Navbar.tsx tests/component/Navbar.test.tsx
git commit -m "feat: add Navbar shell component"
```

---

### Task 15: Wire up the app shell — move `canvas`/`recycle-bin`, trim `Canvas.tsx`

**Files:**
- Create: `app/(app)/layout.tsx`
- Move: `app/canvas/page.tsx` → `app/(app)/canvas/page.tsx` (edit after moving)
- Move: `app/recycle-bin/page.tsx` → `app/(app)/recycle-bin/page.tsx` (no content change)
- Modify: `components/canvas/Canvas.tsx`
- Modify: `tests/component/Canvas.test.tsx`

**Interfaces:**
- Consumes: `Sidebar` (Task 12), `Navbar` (Task 14).
- Produces: `Canvas`'s prop type drops `themeMode`, `accentColor`, `preferredAiModel` — only `threads`, `tasks`, `positions`, `initialTier?`, `initialJarvisMessages` remain.

- [ ] **Step 1: Move the two pages**

```bash
mkdir -p "app/(app)"
git mv app/canvas "app/(app)/canvas"
git mv app/recycle-bin "app/(app)/recycle-bin"
```

- [ ] **Step 2: Update the moved canvas page** (drop the now-unnecessary `db.user` lookup and the three props it fed to `Canvas`)

```tsx
// app/(app)/canvas/page.tsx
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Canvas from "@/components/canvas/Canvas";

export default async function CanvasPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const ownThreads = await db.thread.findMany({
    where: { ownerId: userId, status: "ACTIVE" },
  });
  const myShares = await db.threadShare.findMany({ where: { sharedWithUserId: userId } });
  const sharePermissionByThreadId = new Map(myShares.map((s) => [s.threadId, s.permission]));
  const sharedThreads = await db.thread.findMany({
    where: { id: { in: myShares.map((s) => s.threadId) }, status: "ACTIVE" },
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

  const jarvisMessages = (
    await db.jarvisMessage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
  ).reverse();

  return (
    <Canvas
      threads={threads.map((t) => ({
        id: t.id,
        name: t.name,
        categoryColor: t.categoryColor,
        role: t.ownerId === userId ? ("OWNER" as const) : sharePermissionByThreadId.get(t.id)!,
      }))}
      tasks={tasks.map((t) => ({
        id: t.id,
        primaryThreadId: t.primaryThreadId,
        title: t.title,
        description: t.description,
        workStatus: t.workStatus,
        priority: t.priority,
        priorityIsAiSuggested: t.priorityIsAiSuggested,
        dueDate: t.dueDate,
        updateCount: t._count.updates,
      }))}
      positions={positions}
      initialJarvisMessages={jarvisMessages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls as { tool: string; success: boolean; summary: string }[] | null,
      }))}
    />
  );
}
```

- [ ] **Step 3: Write the app shell layout**

```tsx
// app/(app)/layout.tsx
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Navbar from "@/components/shell/Navbar";
import Sidebar from "@/components/shell/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = session!.user!.id!;
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

  return (
    <div className="flex h-full flex-1">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Navbar
          name={user.name}
          email={user.email}
          themeMode={user.themeMode}
          accentColor={user.accentColor}
          preferredAiModel={user.preferredAiModel}
        />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Trim the settings strip out of `Canvas.tsx`**

In `components/canvas/Canvas.tsx`, make these seven edits:

1. Remove the now-unused imports:

```tsx
// Remove these three lines:
import AccentColorPicker from "@/components/settings/AccentColorPicker";
import ThemeToggle from "@/components/settings/ThemeToggle";
import ModelPicker from "@/components/settings/ModelPicker";
```

and further down:

```tsx
// Remove:
import { themeToCssVariables } from "@/lib/theme";
```

```tsx
// Remove:
import { updateThemePreference } from "@/app/actions/theme";
```

```tsx
// Remove:
import { updatePreferredAiModel } from "@/app/actions/aiModel";
```

2. Drop `themeMode`/`accentColor`/`preferredAiModel` from `CanvasInner`'s props:

```tsx
// Before
function CanvasInner({
  threads,
  tasks,
  positions,
  themeMode,
  accentColor,
  preferredAiModel,
  initialTier,
  initialJarvisMessages,
}: {
  threads: ThreadSummary[];
  tasks: TaskSummary[];
  positions: PositionMap;
  themeMode: "LIGHT" | "DARK";
  accentColor: string;
  preferredAiModel: string;
  initialTier?: "BUBBLE" | "CARD";
  initialJarvisMessages: {
    id: string;
    role: "USER" | "ASSISTANT";
    content: string;
    toolCalls: { tool: string; success: boolean; summary: string }[] | null;
  }[];
}) {

// After
function CanvasInner({
  threads,
  tasks,
  positions,
  initialTier,
  initialJarvisMessages,
}: {
  threads: ThreadSummary[];
  tasks: TaskSummary[];
  positions: PositionMap;
  initialTier?: "BUBBLE" | "CARD";
  initialJarvisMessages: {
    id: string;
    role: "USER" | "ASSISTANT";
    content: string;
    toolCalls: { tool: string; success: boolean; summary: string }[] | null;
  }[];
}) {
```

3. Remove the local theme state:

```tsx
// Before
  const [tier, setTier] = useState<"BUBBLE" | "CARD">(initialTier ?? "CARD");
  // Controlled values for the settings strip's picker/toggle. Kept local so
  // the controls reflect a change the instant it's made, rather than
  // waiting on the updateThemePreference round-trip and a router.refresh()
  // of the layout that actually owns ThemeProvider.
  const [localThemeMode, setLocalThemeMode] = useState(themeMode);
  const [localAccentColor, setLocalAccentColor] = useState(accentColor);
  // Shares loaded per-thread, lazily, when that thread's Share dialog is

// After
  const [tier, setTier] = useState<"BUBBLE" | "CARD">(initialTier ?? "CARD");
  // Shares loaded per-thread, lazily, when that thread's Share dialog is
```

4. Remove the `aiModel` state:

```tsx
// Before
  const [catchUp, setCatchUp] = useState<{ summary: string | null; loading: boolean } | null>(null);
  // Controlled locally (mirroring the theme/accent pattern above) so the
  // settings strip's picker reflects a change immediately rather than
  // waiting on the updatePreferredAiModel round-trip.
  const [aiModel, setAiModel] = useState(preferredAiModel);

  const withOverride = useCallback(

// After
  const [catchUp, setCatchUp] = useState<{ summary: string | null; loading: boolean } | null>(null);

  const withOverride = useCallback(
```

5. Remove `handleThemeChange`:

```tsx
// Before
  // Applies the CSS variables immediately (so the change is visible without
  // waiting on the Server Action + router.refresh() round-trip that
  // reconciles the layout-level ThemeProvider's own props), then persists
  // the preference and refreshes so a later navigation/reload is consistent.
  const handleThemeChange = useCallback(
    async (mode: "LIGHT" | "DARK", color: string) => {
      setLocalThemeMode(mode);
      setLocalAccentColor(color);
      const vars = themeToCssVariables(mode, color);
      for (const [key, value] of Object.entries(vars)) {
        document.documentElement.style.setProperty(key, value);
      }
      await updateThemePreference(mode, color);
      router.refresh();
    },
    [router]
  );

  const nodes = useMemo<Node[]>(() => {

// After
  const nodes = useMemo<Node[]>(() => {
```

6. Remove the floating settings strip's JSX:

```tsx
// Before
      <div style={{ position: "absolute", top: 8, right: 8, zIndex: 10, display: "flex", alignItems: "center", gap: 12 }}>
        <AccentColorPicker
          value={localAccentColor}
          onChange={(hex) => handleThemeChange(localThemeMode, hex)}
        />
        <ThemeToggle
          value={localThemeMode}
          onChange={(mode) => handleThemeChange(mode, localAccentColor)}
        />
        <ModelPicker
          value={aiModel}
          onChange={async (model) => {
            setAiModel(model);
            await updatePreferredAiModel(model);
          }}
        />
      </div>

      <ReactFlow

// After
      <ReactFlow
```

7. Drop the same three props from the default-exported `Canvas`:

```tsx
// Before
export default function Canvas(props: {
  threads: ThreadSummary[];
  tasks: TaskSummary[];
  positions: PositionMap;
  themeMode: "LIGHT" | "DARK";
  accentColor: string;
  preferredAiModel: string;
  // Seeds the initial zoom tier — primarily so tests can render straight

// After
export default function Canvas(props: {
  threads: ThreadSummary[];
  tasks: TaskSummary[];
  positions: PositionMap;
  // Seeds the initial zoom tier — primarily so tests can render straight
```

- [ ] **Step 5: Update `Canvas.test.tsx`** to match — remove the tests that moved to `UserMenu.test.tsx` and their now-unused mocks

1. Remove unused imports:

```ts
// Before
import { updateThemePreference } from "@/app/actions/theme";
import { openThreadAndMaybeGetCatchUp, getStoredThreadSummary } from "@/app/actions/threadCatchUp";
import { updatePreferredAiModel } from "@/app/actions/aiModel";

// After
import { openThreadAndMaybeGetCatchUp, getStoredThreadSummary } from "@/app/actions/threadCatchUp";
```

2. Remove the now-unused mocks:

```ts
// Before
vi.mock("@/app/actions/theme", () => ({ updateThemePreference: vi.fn() }));
vi.mock("@/app/actions/threadCatchUp", () => ({
  openThreadAndMaybeGetCatchUp: vi.fn(),
  getStoredThreadSummary: vi.fn(),
}));
vi.mock("@/app/actions/aiModel", () => ({ updatePreferredAiModel: vi.fn() }));

// After
vi.mock("@/app/actions/threadCatchUp", () => ({
  openThreadAndMaybeGetCatchUp: vi.fn(),
  getStoredThreadSummary: vi.fn(),
}));
```

3. Remove the now-unused `mockReset` calls in `beforeEach`:

```ts
// Before
  vi.mocked(listThreadShares).mockReset().mockResolvedValue([]);
  vi.mocked(revokeThreadShare).mockReset().mockResolvedValue(undefined);
  vi.mocked(updateThemePreference).mockReset();
  vi.mocked(openThreadAndMaybeGetCatchUp).mockReset();
  vi.mocked(getStoredThreadSummary).mockReset();
  vi.mocked(updatePreferredAiModel).mockReset();
});

// After
  vi.mocked(listThreadShares).mockReset().mockResolvedValue([]);
  vi.mocked(revokeThreadShare).mockReset().mockResolvedValue(undefined);
  vi.mocked(openThreadAndMaybeGetCatchUp).mockReset();
  vi.mocked(getStoredThreadSummary).mockReset();
});
```

4. Shrink `defaultThemeProps`:

```ts
// Before
const defaultThemeProps = {
  themeMode: "DARK" as const,
  accentColor: "#38e0ff",
  preferredAiModel: "gemini-3.8-flash",
  initialJarvisMessages: [],
};

// After
const defaultThemeProps = {
  initialJarvisMessages: [],
};
```

5. Delete the whole `"Canvas — theme settings (Finding 1 wiring)"` describe block:

```ts
// Delete this entire block:
describe("Canvas — theme settings (Finding 1 wiring)", () => {
  it("calls updateThemePreference with the new accent color when the color picker changes", async () => {
    render(<Canvas threads={[]} tasks={[]} positions={{}} {...defaultThemeProps} />);

    fireEvent.change(screen.getByLabelText("Accent color"), { target: { value: "#ff5fa8" } });

    await waitFor(() => expect(updateThemePreference).toHaveBeenCalledWith("DARK", "#ff5fa8"));
  });

  it("calls updateThemePreference with the toggled mode when the theme toggle is clicked", async () => {
    render(<Canvas threads={[]} tasks={[]} positions={{}} {...defaultThemeProps} />);

    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => expect(updateThemePreference).toHaveBeenCalledWith("LIGHT", "#38e0ff"));
  });

  it("applies the chosen accent color to the document root immediately, without waiting on the Server Action", () => {
    render(<Canvas threads={[]} tasks={[]} positions={{}} {...defaultThemeProps} />);

    fireEvent.change(screen.getByLabelText("Accent color"), { target: { value: "#ff5fa8" } });

    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#ff5fa8");
  });
});
```

6. Rename the describe block that held the model-picker test, and remove that one test:

```ts
// Before
describe("Canvas — thread catch-up and AI model picker (Task 11 wiring)", () => {

// After
describe("Canvas — thread catch-up (Task 11 wiring)", () => {
```

```ts
// Delete this test (leave the rest of the describe block intact):
  it("changing the model picker calls updatePreferredAiModel", async () => {
    render(<Canvas threads={[]} tasks={[]} positions={{}} {...defaultThemeProps} />);

    fireEvent.change(screen.getByLabelText("AI model"), { target: { value: "gemini-3.1-pro-preview" } });

    await waitFor(() => {
      expect(updatePreferredAiModel).toHaveBeenCalledWith("gemini-3.1-pro-preview");
    });
  });
```

- [ ] **Step 6: Run the full component test suite**

Run: `npm test`
Expected: PASS — every file in `tests/component/`, `tests/unit/`, and `tests/integration/` passes (`fileParallelism: false` means this runs sequentially; give it time).

- [ ] **Step 7: Commit**

```bash
git add "app/(app)" components/canvas/Canvas.tsx tests/component/Canvas.test.tsx
git status
```

Confirm the moved files show as renames (`app/canvas/page.tsx -> app/(app)/canvas/page.tsx`, `app/recycle-bin/page.tsx -> app/(app)/recycle-bin/page.tsx`) before committing:

```bash
git commit -m "feat: wrap canvas/recycle-bin in a Navbar+Sidebar app shell, move settings out of Canvas"
```

---

### Task 16: End-to-end regression + forgot-password flow

**Files:**
- Create: `tests/e2e/forgot-password-flow.spec.ts`

**Interfaces:**
- Consumes: the full stack built in Tasks 1-15.

- [ ] **Step 1: Write the new e2e spec**

```ts
// tests/e2e/forgot-password-flow.spec.ts
import { test, expect } from "@playwright/test";

test("forgot password: request a reset link, use it, then log in with the new password", async ({ page }) => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `forgot-${runId}@example.com`;

  await test.step("sign up", async () => {
    await page.goto("/signup");
    await page.getByPlaceholder("Name").fill("Forgetful");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill("correcthorse123");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/canvas/);
  });

  await test.step("log out via the navbar's user menu", async () => {
    await page.getByRole("button", { name: "User menu" }).click();
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  let resetPath = "";
  await test.step("request a password reset link", async () => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();

    const link = page.getByRole("link", { name: /\/reset-password\?token=/ });
    await expect(link).toBeVisible();
    resetPath = (await link.getAttribute("href"))!;
  });

  await test.step("reset the password", async () => {
    await page.goto(resetPath);
    await page.getByLabel("New password").fill("brandnewpassword123");
    await page.getByLabel("Confirm new password").fill("brandnewpassword123");
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByText("Password updated")).toBeVisible();
  });

  await test.step("log in with the new password", async () => {
    await page.getByRole("link", { name: "Go to log in" }).click();
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill("brandnewpassword123");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/canvas/);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- tests/e2e/forgot-password-flow.spec.ts`
Expected: PASS (all `test.step`s green)

- [ ] **Step 3: Run the full e2e suite as a regression check**

Run: `npm run test:e2e`
Expected: PASS — `foundation-flow.spec.ts`, `jarvis-flow.spec.ts`, `catchup-flow.spec.ts`, and `ai-prioritization-flow.spec.ts` all still pass unchanged, confirming the shell/layout move and page restyles didn't break the existing flows (they navigate to `/canvas` and `/recycle-bin` and rely only on selectors this plan preserved).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/forgot-password-flow.spec.ts
git commit -m "test: add e2e coverage for the forgot-password flow"
```

---

## Self-Review Notes

- **Spec coverage:** UI kit (Tasks 1-4) → login/signup restyle (Tasks 8-9) → forgot/reset password backend + UI (Tasks 5-7, 10-11) → app shell (Tasks 12-15) → e2e (Task 16). Every section of `docs/superpowers/specs/2026-09-13-auth-ux-and-app-shell-design.md` maps to a task.
- **Placeholder scan:** no TBDs; every step has complete, runnable code.
- **Type consistency:** `UserMenu`'s prop shape (`name`, `email`, `themeMode`, `accentColor`, `preferredAiModel`) is identical across Tasks 13, 14, and 15's `Navbar`/`AppLayout` usage. `requestPasswordReset`/`resetPassword` signatures are identical across Tasks 6, 7, 10, 11, and 16.
