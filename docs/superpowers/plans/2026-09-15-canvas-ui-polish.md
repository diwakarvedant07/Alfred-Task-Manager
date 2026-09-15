# Canvas Board & Jarvis UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the six crude canvas-board components (`NewThreadButton`, `NewTaskButton`, `ShareThreadDialog`, `CardMenu`, `CatchUpModal`, `TaskDetailPanel`) and `JarvisPanel` using the existing UI kit, adding `Modal`/`Select`/`Textarea` primitives to complete it.

**Architecture:** Three new `components/ui/` primitives extend the kit built in the previous sub-project. `NewThreadButton`, `NewTaskButton`, and `ShareThreadDialog` are rebuilt on the new `Modal` (centered card + dimmed backdrop). `CardMenu` and `CatchUpModal` keep their existing structure (popover-with-long-press and full-screen-takeover respectively) and only get visual polish. `TaskDetailPanel` keeps its existing right-side-panel structure (positioned by `Canvas.tsx`, unchanged) and gets its internals rebuilt on the kit. `JarvisPanel` keeps its floating bottom-right position and becomes a proper chat-bubble-styled widget. `Canvas.tsx` itself needs no changes anywhere in this plan — every rebuilt component keeps its existing prop interface.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, `lucide-react` (already a dependency), Vitest + React Testing Library, Playwright.

## Global Constraints

- Every existing `aria-label`, `role`, and accessible name in all six touched components must survive exactly, character-for-character — this is what keeps the following test files passing unmodified: `tests/component/{NewThreadButton,NewTaskButton,ShareThreadDialog,CardMenu,CatchUpModal,TaskDetailPanel,JarvisPanel}.test.tsx`, plus `tests/component/Canvas.test.tsx`'s check of `role="dialog"`/`name="New task in th1"`, plus the e2e specs `foundation-flow.spec.ts`, `catchup-flow.spec.ts`, `ai-prioritization-flow.spec.ts`, and `jarvis-flow.spec.ts`.
- Every new/edited component that reads a theme CSS variable must supply a DARK-mode fallback in the `var()` call itself, matching `lib/theme.ts`'s DARK output: `var(--bg, #0a0e14)`, `var(--panel-bg, rgba(15,25,35,0.85))`, `var(--text, #eafcff)`, `var(--accent, #38e0ff)`.
- No new dependencies — `lucide-react` is already installed.
- `CardMenu`'s long-press threshold stays `LONG_PRESS_MS = 450` (its test advances fake timers by 500ms).
- `JarvisPanel`'s tool-call chip text must render as the exact string `"✓ " + summary` or `"✗ " + summary` (a test asserts `getByText("✓ Created task X in Y")` verbatim) — restyle the container, not the text content.
- `Canvas.tsx` is not modified by this plan — every rebuilt component's prop interface (name, shape) is unchanged from what `Canvas.tsx` already passes it.
- Test layout follows existing convention: Vitest + React Testing Library in `tests/component/`. Run with `npm test -- <path>`.

---

### Task 1: `Modal` UI primitive

**Files:**
- Create: `components/ui/Modal.tsx`
- Test: `tests/component/Modal.test.tsx`

**Interfaces:**
- Produces: `export default function Modal(props: { ariaLabel: string; onClose: () => void; children: React.ReactNode })` from `components/ui/Modal.tsx`. Renders a dimmed full-screen backdrop with a centered card carrying `role="dialog"` and `aria-label={ariaLabel}`. Closes on backdrop click or `Escape`; clicking inside the card does not close it.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/component/Modal.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Modal from "@/components/ui/Modal";

describe("Modal", () => {
  it("renders children inside a dialog with the given accessible name", () => {
    render(
      <Modal ariaLabel="Example dialog" onClose={vi.fn()}>
        <p>Content</p>
      </Modal>
    );

    expect(screen.getByRole("dialog", { name: "Example dialog" })).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("calls onClose when the backdrop is clicked, but not when the card itself is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal ariaLabel="Example dialog" onClose={onClose}>
        <p>Content</p>
      </Modal>
    );

    fireEvent.click(screen.getByText("Content"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog", { name: "Example dialog" }).parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal ariaLabel="Example dialog" onClose={onClose}>
        <p>Content</p>
      </Modal>
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/component/Modal.test.tsx`
Expected: FAIL — `Cannot find module '@/components/ui/Modal'`

- [ ] **Step 3: Write the implementation**

```tsx
// components/ui/Modal.tsx
"use client";

import { useEffect, type ReactNode } from "react";

export default function Modal({
  ariaLabel,
  onClose,
  children,
}: {
  ariaLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/55 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] p-6 shadow-2xl"
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/component/Modal.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add components/ui/Modal.tsx tests/component/Modal.test.tsx
git commit -m "feat: add Modal UI primitive"
```

---

### Task 2: `Select` UI primitive

**Files:**
- Create: `components/ui/Select.tsx`
- Test: `tests/component/Select.test.tsx`

**Interfaces:**
- Produces: `export default function Select(props: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hideLabel?: boolean; children: React.ReactNode })` from `components/ui/Select.tsx`. Same `label`/`hideLabel` API as `Input.tsx`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/component/Select.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Select from "@/components/ui/Select";

describe("Select", () => {
  it("associates the label with the field and reports changes", () => {
    const onChange = vi.fn();
    render(
      <Select label="Permission" value="VIEWER" onChange={onChange}>
        <option value="VIEWER">Viewer</option>
        <option value="EDITOR">Editor</option>
      </Select>
    );

    fireEvent.change(screen.getByLabelText("Permission"), { target: { value: "EDITOR" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("keeps the label accessible but visually hidden when hideLabel is set", () => {
    render(
      <Select label="Permission" hideLabel>
        <option value="VIEWER">Viewer</option>
      </Select>
    );

    expect(screen.getByLabelText("Permission")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/component/Select.test.tsx`
Expected: FAIL — `Cannot find module '@/components/ui/Select'`

- [ ] **Step 3: Write the implementation**

```tsx
// components/ui/Select.tsx
"use client";

import { useId, type SelectHTMLAttributes, type ReactNode } from "react";

export default function Select({
  label,
  hideLabel = false,
  className = "",
  id,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hideLabel?: boolean;
  children: ReactNode;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label
        htmlFor={inputId}
        className={hideLabel ? "sr-only" : "font-medium text-[var(--text,#eafcff)]"}
      >
        {label}
      </label>
      <select
        id={inputId}
        className={`rounded-lg border border-[var(--text,#eafcff)]/15 bg-[var(--panel-bg,rgba(15,25,35,0.85))] px-3 py-2 text-[var(--text,#eafcff)] outline-none transition-colors focus:border-[var(--accent,#38e0ff)] ${className}`}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/component/Select.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add components/ui/Select.tsx tests/component/Select.test.tsx
git commit -m "feat: add Select UI primitive"
```

---

### Task 3: `Textarea` UI primitive

**Files:**
- Create: `components/ui/Textarea.tsx`
- Test: `tests/component/Textarea.test.tsx`

**Interfaces:**
- Produces: `export default function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hideLabel?: boolean })` from `components/ui/Textarea.tsx`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/component/Textarea.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Textarea from "@/components/ui/Textarea";

describe("Textarea", () => {
  it("associates the label with the field and reports changes", () => {
    const onChange = vi.fn();
    render(<Textarea label="Description" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "hello" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("keeps the label accessible but visually hidden when hideLabel is set", () => {
    render(<Textarea label="Description" hideLabel placeholder="Description" />);

    expect(screen.getByLabelText("Description")).toHaveAttribute("placeholder", "Description");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/component/Textarea.test.tsx`
Expected: FAIL — `Cannot find module '@/components/ui/Textarea'`

- [ ] **Step 3: Write the implementation**

```tsx
// components/ui/Textarea.tsx
"use client";

import { useId, type TextareaHTMLAttributes } from "react";

export default function Textarea({
  label,
  hideLabel = false,
  className = "",
  id,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hideLabel?: boolean;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label
        htmlFor={inputId}
        className={hideLabel ? "sr-only" : "font-medium text-[var(--text,#eafcff)]"}
      >
        {label}
      </label>
      <textarea
        id={inputId}
        className={`w-full rounded-lg border border-[var(--text,#eafcff)]/15 bg-[var(--panel-bg,rgba(15,25,35,0.85))] px-3 py-2 text-[var(--text,#eafcff)] placeholder:text-[var(--text,#eafcff)]/40 outline-none transition-colors focus:border-[var(--accent,#38e0ff)] ${className}`}
        {...rest}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/component/Textarea.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add components/ui/Textarea.tsx tests/component/Textarea.test.tsx
git commit -m "feat: add Textarea UI primitive"
```

---

### Task 4: Rebuild `NewThreadButton` on `Modal`

**Files:**
- Modify: `components/canvas/NewThreadButton.tsx`

**Interfaces:**
- Consumes: `Modal` (Task 1), `Input` and `Button` (already in `components/ui/`).
- Unchanged: `NewThreadButton({ onCreate }: { onCreate: (input: { name: string; categoryColor: string }) => void })` — same props as before.

- [ ] **Step 1: Confirm the existing test still describes the required behavior**

Read `tests/component/NewThreadButton.test.tsx` — it asserts `getByRole("button", { name: "New thread" })`, `getByLabelText("Thread name")`, and `getByRole("button", { name: "Create" })`. No test changes needed for this task; the rebuild must keep these three accessible names exactly.

- [ ] **Step 2: Run the existing test to confirm current baseline**

Run: `npm test -- tests/component/NewThreadButton.test.tsx`
Expected: PASS (1 test) — confirms the starting point before the rewrite.

- [ ] **Step 3: Rewrite the implementation**

```tsx
// components/canvas/NewThreadButton.tsx
"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

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
    return <Button onClick={() => setOpen(true)}>New thread</Button>;
  }

  return (
    <Modal ariaLabel="New thread" onClose={() => setOpen(false)}>
      <h2 className="mb-4 text-lg font-semibold text-[var(--text,#eafcff)]">New thread</h2>
      <div className="flex flex-col gap-4">
        <Input label="Thread name" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="flex items-center gap-3 text-sm text-[var(--text,#eafcff)]">
          <span
            className="h-6 w-6 rounded-md border border-[var(--text,#eafcff)]/20"
            style={{ backgroundColor: categoryColor }}
          />
          Color
          <input
            type="color"
            aria-label="Color"
            value={categoryColor}
            onChange={(e) => setCategoryColor(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded border border-[var(--text,#eafcff)]/15 bg-transparent p-0.5"
          />
        </label>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            onCreate({ name, categoryColor });
            setOpen(false);
            setName("");
          }}
        >
          Create
        </Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Run test to verify it still passes**

Run: `npm test -- tests/component/NewThreadButton.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add components/canvas/NewThreadButton.tsx
git commit -m "feat: rebuild NewThreadButton on the Modal UI kit"
```

---

### Task 5: Rebuild `NewTaskButton` on `Modal`

**Files:**
- Modify: `components/canvas/NewTaskButton.tsx`

**Interfaces:**
- Consumes: `Modal` (Task 1), `Textarea` (Task 3), `Input` and `Button` (already in `components/ui/`).
- Unchanged: `NewTaskButton({ threadId, onCreate }: { threadId: string; onCreate: (input: { title: string; description?: string; dueDate?: Date }) => void })`.

**Named risk:** `tests/component/Canvas.test.tsx` has an assertion checking `queryByRole("dialog", { name: "New task in th1" })` is gone after task creation — the dialog's `aria-label` must stay the exact template string `` `New task in ${threadId}` ``.

- [ ] **Step 1: Confirm the existing tests still describe the required behavior**

Read `tests/component/NewTaskButton.test.tsx` — asserts `getByRole("button", { name: "New task" })`, `getByLabelText("Title")`, `getByLabelText("Description")`, `getByLabelText("Due date")`, and `getByRole("button", { name: "Create task" })`, with three cases (full input, partial input, blank-optional-fields). No test changes needed.

- [ ] **Step 2: Run the existing tests to confirm current baseline**

Run: `npm test -- tests/component/NewTaskButton.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 3: Rewrite the implementation**

```tsx
// components/canvas/NewTaskButton.tsx
"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";

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
    return <Button onClick={() => setOpen(true)}>New task</Button>;
  }

  return (
    <Modal ariaLabel={`New task in ${threadId}`} onClose={() => setOpen(false)}>
      <h2 className="mb-4 text-lg font-semibold text-[var(--text,#eafcff)]">New task</h2>
      <div className="flex flex-col gap-4">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Input
          label="Due date"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button
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
        </Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Run tests to verify they still pass**

Run: `npm test -- tests/component/NewTaskButton.test.tsx tests/component/Canvas.test.tsx`
Expected: PASS (3 + Canvas's full suite, including the "New task in th1" dialog-closed assertion)

- [ ] **Step 5: Commit**

```bash
git add components/canvas/NewTaskButton.tsx
git commit -m "feat: rebuild NewTaskButton on the Modal UI kit"
```

---

### Task 6: Rebuild `ShareThreadDialog` on `Modal`

**Files:**
- Modify: `components/canvas/ShareThreadDialog.tsx`

**Interfaces:**
- Consumes: `Modal` (Task 1), `Select` (Task 2), `Input` and `Button` (already in `components/ui/`).
- Unchanged: same props as before (`threadId`, `onShare`, `onOpen?`, `shares?`, `onRevoke?`).

**Named risk:** `tests/e2e/foundation-flow.spec.ts` drives this dialog end-to-end (`getByRole("button", {name:"Share"})` → `getByLabel("Email")` → `getByLabel("Permission").selectOption("VIEWER")` → `getByRole("button", {name:"Share thread"})`, and later checks a `"Revoke"` button) — every one of those accessible names must survive exactly.

- [ ] **Step 1: Confirm the existing test still describes the required behavior**

Read `tests/component/ShareThreadDialog.test.tsx` — asserts `getByRole("button", { name: "Share" })`, `getByLabelText("Email")`, `getByLabelText("Permission")`, and `getByRole("button", { name: "Share thread" })`. No test changes needed.

- [ ] **Step 2: Run the existing test to confirm current baseline**

Run: `npm test -- tests/component/ShareThreadDialog.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 3: Rewrite the implementation**

```tsx
// components/canvas/ShareThreadDialog.tsx
"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";

type ShareItem = {
  id: string;
  permission: "VIEWER" | "EDITOR";
  sharedWithUser: { name: string; email: string };
};

export default function ShareThreadDialog({
  threadId,
  onShare,
  onOpen,
  shares,
  onRevoke,
}: {
  threadId: string;
  onShare: (email: string, permission: "VIEWER" | "EDITOR") => void;
  onOpen?: () => void;
  shares?: ShareItem[];
  onRevoke?: (shareId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"VIEWER" | "EDITOR">("VIEWER");

  if (!open) {
    return (
      <Button
        variant="secondary"
        onClick={() => {
          setOpen(true);
          onOpen?.();
        }}
      >
        Share
      </Button>
    );
  }

  return (
    <Modal ariaLabel={`Share thread ${threadId}`} onClose={() => setOpen(false)}>
      <h2 className="mb-4 text-lg font-semibold text-[var(--text,#eafcff)]">Share thread</h2>
      <div className="flex flex-col gap-4">
        <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Select
          label="Permission"
          value={permission}
          onChange={(e) => setPermission(e.target.value as "VIEWER" | "EDITOR")}
        >
          <option value="VIEWER">Viewer</option>
          <option value="EDITOR">Editor</option>
        </Select>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            onShare(email, permission);
            setOpen(false);
          }}
        >
          Share thread
        </Button>
      </div>

      {shares && shares.length > 0 && (
        <ul
          aria-label="Current shares"
          className="mt-6 flex flex-col gap-2 border-t border-[var(--text,#eafcff)]/10 pt-4"
        >
          {shares.map((share) => (
            <li
              key={share.id}
              className="flex items-center justify-between gap-2 text-sm text-[var(--text,#eafcff)]/80"
            >
              <span>
                {share.sharedWithUser.name} ({share.sharedWithUser.email}) — {share.permission}
              </span>
              <Button variant="secondary" onClick={() => onRevoke?.(share.id)}>
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
```

- [ ] **Step 4: Run test to verify it still passes**

Run: `npm test -- tests/component/ShareThreadDialog.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add components/canvas/ShareThreadDialog.tsx
git commit -m "feat: rebuild ShareThreadDialog on the Modal UI kit"
```

---

### Task 7: Restyle `CardMenu` (visual only, keep long-press + menu semantics)

**Files:**
- Modify: `components/canvas/CardMenu.tsx`

**Interfaces:**
- Unchanged: same props as before (`TaskMenuProps | ThreadMenuProps` union).

**Named risk:** the long-press interaction (`data-testid="card-menu-trigger-area"`, `LONG_PRESS_MS = 450`) and the `role="menu"`/`role="menuitem"` structure must be byte-identical in behavior — only add `className`s and swap the `⋮` character for a `MoreVertical` icon.

- [ ] **Step 1: Confirm the existing tests still describe the required behavior**

Read `tests/component/CardMenu.test.tsx` — six tests covering task/thread variants, `canEditMeta`/`canCloseOrDelete` gating, long-press opening, and the `onViewCatchUp` item. No test changes needed.

- [ ] **Step 2: Run the existing tests to confirm current baseline**

Run: `npm test -- tests/component/CardMenu.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 3: Rewrite the implementation**

```tsx
// components/canvas/CardMenu.tsx
"use client";

import { useRef, useState } from "react";
import { MoreVertical } from "lucide-react";

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
  onViewCatchUp: () => void;
  canEditMeta?: boolean;
  canCloseOrDelete?: boolean;
};

const LONG_PRESS_MS = 450;

const menuItemClassName =
  "block w-full rounded-md px-3 py-2 text-left text-sm text-[var(--text,#eafcff)] hover:bg-[var(--text,#eafcff)]/10";

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
      onClick={(e) => e.stopPropagation()}
      className="relative"
    >
      <button
        aria-label="More actions"
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text,#eafcff)]/70 hover:bg-[var(--text,#eafcff)]/10 hover:text-[var(--text,#eafcff)]"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-48 rounded-lg border border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] p-1 shadow-xl"
        >
          {props.variant === "task" ? (
            <>
              <button role="menuitem" className={menuItemClassName} onClick={() => runAndClose(props.onRename)}>
                Rename
              </button>
              <button role="menuitem" className={menuItemClassName} onClick={() => runAndClose(props.onMoveToThread)}>
                Move to thread…
              </button>
              <button
                role="menuitem"
                className={menuItemClassName}
                onClick={() => runAndClose(props.onLinkSecondaryThread)}
              >
                Link secondary thread…
              </button>
              <button role="menuitem" className={menuItemClassName} onClick={() => runAndClose(props.onDelete)}>
                Delete
              </button>
            </>
          ) : (
            <>
              <button role="menuitem" className={menuItemClassName} onClick={() => runAndClose(props.onViewCatchUp)}>
                View catch-up
              </button>
              {(props.canEditMeta ?? true) && (
                <>
                  <button role="menuitem" className={menuItemClassName} onClick={() => runAndClose(props.onRename)}>
                    Rename thread
                  </button>
                  <button
                    role="menuitem"
                    className={menuItemClassName}
                    onClick={() => runAndClose(props.onChangeColor)}
                  >
                    Change category color
                  </button>
                </>
              )}
              {(props.canCloseOrDelete ?? true) && (
                <>
                  <button role="menuitem" className={menuItemClassName} onClick={() => runAndClose(props.onClose)}>
                    Close thread
                  </button>
                  <button role="menuitem" className={menuItemClassName} onClick={() => runAndClose(props.onDelete)}>
                    Delete thread
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they still pass**

Run: `npm test -- tests/component/CardMenu.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add components/canvas/CardMenu.tsx
git commit -m "style: restyle CardMenu with lucide icon, keep long-press and menu semantics"
```

---

### Task 8: Restyle `CatchUpModal` (visual only, keep full-screen structure)

**Files:**
- Modify: `components/canvas/CatchUpModal.tsx`

**Interfaces:**
- Consumes: `Button` (already in `components/ui/`).
- Unchanged: same props as before (`summary`, `loading`, `onClose`).

**Named risk:** `tests/e2e/catchup-flow.spec.ts` locates this via `getByRole("dialog", { name: "Catch-up" })` — the `role="dialog"`/`aria-label="Catch-up"` on the outer element must stay exactly as-is (this component does NOT switch to the new `Modal` primitive — it keeps its own full-viewport takeover, per the design spec).

- [ ] **Step 1: Confirm the existing tests still describe the required behavior**

Read `tests/component/CatchUpModal.test.tsx` — asserts `getByText("Catching you up…")`, the summary text, `getByRole("button", { name: "Close" })`, and `getByText("Got it")`. No test changes needed.

- [ ] **Step 2: Run the existing tests to confirm current baseline**

Run: `npm test -- tests/component/CatchUpModal.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 3: Rewrite the implementation**

```tsx
// components/canvas/CatchUpModal.tsx
"use client";

import { X } from "lucide-react";
import Button from "@/components/ui/Button";

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
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-[var(--bg,#0a0e14)] text-[var(--text,#eafcff)]"
    >
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-[var(--text,#eafcff)]/70 hover:bg-[var(--text,#eafcff)]/10 hover:text-[var(--text,#eafcff)]"
      >
        <X size={18} />
      </button>
      {loading ? (
        <p className="text-sm text-[var(--text,#eafcff)]/70">Catching you up…</p>
      ) : (
        <p className="max-w-lg text-center text-lg">{summary}</p>
      )}
      {!loading && <Button onClick={onClose}>Got it</Button>}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they still pass**

Run: `npm test -- tests/component/CatchUpModal.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add components/canvas/CatchUpModal.tsx
git commit -m "style: restyle CatchUpModal with lucide icon and Button"
```

---

### Task 9: Rebuild `TaskDetailPanel` internals (keep right-side-panel structure)

**Files:**
- Modify: `components/task-detail/TaskDetailPanel.tsx`

**Interfaces:**
- Consumes: `Input`, `Select` (Task 2), `Textarea` (Task 3), `Button` (already in `components/ui/`).
- Unchanged: same props as before (`task`, `updates`, `onUpdateTask`, `onAddComment`, `onClose`, `canEdit?`). `Canvas.tsx`'s absolutely-positioned wrapper `<div>` around this component is untouched — this task only changes what's inside `TaskDetailPanel.tsx` itself.

**Named risk:** `tests/e2e/foundation-flow.spec.ts` and `ai-prioritization-flow.spec.ts` both drive this panel via `getByRole("dialog", { name: "Task detail" })`, `getByLabel("Title")`, `getByLabel("Description")`, `getByLabel("Work status")`, `getByLabel("Priority")`, `getByLabel("Add an update")`, `getByText("Post update")`, and `getByLabel("Close")` — every one of these must survive exactly, including on a `disabled` (viewer) render.

- [ ] **Step 1: Confirm the existing tests still describe the required behavior**

Read `tests/component/TaskDetailPanel.test.tsx` — asserts `getByDisplayValue("Draft exec summary")`, a status change via `getByLabelText("Work status")`, a comment submission via `getByLabelText("Add an update")` + `getByText("Post update")` (and that the input clears after), and `getByLabelText("AI suggested")` presence/absence based on `priorityIsAiSuggested`. No test changes needed.

- [ ] **Step 2: Run the existing tests to confirm current baseline**

Run: `npm test -- tests/component/TaskDetailPanel.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 3: Rewrite the implementation**

```tsx
// components/task-detail/TaskDetailPanel.tsx
"use client";

import { useState } from "react";
import { X } from "lucide-react";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";

type Task = {
  id: string;
  title: string;
  description: string;
  workStatus: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH";
  priorityIsAiSuggested: boolean;
  dueDate: Date | null;
};

type TaskUpdateItem = { id: string; body: string; authorId: string; createdAt: Date };

export default function TaskDetailPanel({
  task,
  updates,
  onUpdateTask,
  onAddComment,
  onClose,
  canEdit = true,
}: {
  task: Task;
  updates: TaskUpdateItem[];
  onUpdateTask: (patch: Partial<Pick<Task, "title" | "description" | "workStatus" | "priority" | "dueDate">>) => void;
  onAddComment: (body: string) => void;
  onClose: () => void;
  canEdit?: boolean;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div
      role="dialog"
      aria-label="Task detail"
      className="flex h-full flex-col gap-4 overflow-y-auto border-l border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] p-5 text-[var(--text,#eafcff)]"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Task detail</h2>
        <button
          aria-label="Close"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text,#eafcff)]/70 hover:bg-[var(--text,#eafcff)]/10 hover:text-[var(--text,#eafcff)]"
        >
          <X size={18} />
        </button>
      </div>

      {!canEdit && (
        <p className="rounded-lg border border-[var(--accent,#38e0ff)]/30 bg-[var(--accent,#38e0ff)]/10 px-3 py-2 text-sm">
          You have view-only access to this thread.
        </p>
      )}

      <Input
        label="Title"
        value={task.title}
        disabled={!canEdit}
        onChange={(e) => onUpdateTask({ title: e.target.value })}
      />
      <Textarea
        label="Description"
        value={task.description}
        disabled={!canEdit}
        onChange={(e) => onUpdateTask({ description: e.target.value })}
      />

      <Select
        label="Work status"
        value={task.workStatus}
        disabled={!canEdit}
        onChange={(e) => onUpdateTask({ workStatus: e.target.value as Task["workStatus"] })}
      >
        <option value="TODO">To Do</option>
        <option value="IN_PROGRESS">In Progress</option>
        <option value="DONE">Done</option>
      </Select>

      <div className="flex flex-col gap-1.5">
        <Select
          label="Priority"
          value={task.priority}
          disabled={!canEdit}
          onChange={(e) => onUpdateTask({ priority: e.target.value as Task["priority"] })}
        >
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </Select>
        {task.priorityIsAiSuggested && (
          <span
            aria-label="AI suggested"
            className="self-start rounded-full bg-[var(--accent,#38e0ff)]/15 px-2 py-0.5 text-xs text-[var(--accent,#38e0ff)]"
          >
            🤖 AI
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-[var(--text,#eafcff)]/10 pt-4">
        {updates.map((u) => (
          <p key={u.id} className="text-sm text-[var(--text,#eafcff)]/80">
            {u.body}
          </p>
        ))}
      </div>

      <Textarea label="Add an update" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <Button
        onClick={() => {
          onAddComment(draft);
          setDraft("");
        }}
      >
        Post update
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they still pass**

Run: `npm test -- tests/component/TaskDetailPanel.test.tsx tests/component/Canvas.test.tsx`
Expected: PASS (5 + Canvas's full suite)

- [ ] **Step 5: Commit**

```bash
git add components/task-detail/TaskDetailPanel.tsx
git commit -m "feat: rebuild TaskDetailPanel internals on the UI kit"
```

---

### Task 10: Modernize `JarvisPanel` (keep bottom-right floating position)

**Files:**
- Modify: `components/jarvis/JarvisPanel.tsx`

**Interfaces:**
- Consumes: `Textarea` (Task 3), `Button` (already in `components/ui/`).
- Unchanged: same props as before (`initialMessages`).

**Named risk:** `tests/component/JarvisPanel.test.tsx` asserts the exact string `"✓ Created task X in Y"` and `"✗ No access to that thread"` via `getByText` — the `{c.success ? "✓" : "✗"} {c.summary}` text-node sequence must be preserved verbatim, just restyled around. `tests/e2e/jarvis-flow.spec.ts` locates the panel via `getByRole("dialog", { name: "Jarvis chat" })`.

- [ ] **Step 1: Confirm the existing tests still describe the required behavior**

Read `tests/component/JarvisPanel.test.tsx` — eight tests covering collapsed-by-default, message ordering, sending a message, `router.refresh()` after send, success/failure tool-call chip text, error state with draft restoration, and not sending an empty message. No test changes needed.

- [ ] **Step 2: Run the existing tests to confirm current baseline**

Run: `npm test -- tests/component/JarvisPanel.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 3: Rewrite the implementation**

```tsx
// components/jarvis/JarvisPanel.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import { sendJarvisMessage } from "@/app/actions/jarvis";

type ChipEntry = { tool: string; success: boolean; summary: string };
type JarvisMessageView = { id: string; role: "USER" | "ASSISTANT"; content: string; toolCalls: ChipEntry[] | null };

export default function JarvisPanel({ initialMessages }: { initialMessages: JarvisMessageView[] }) {
  const router = useRouter();
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
      router.refresh();
    } catch {
      setError("Couldn't reach Jarvis — please try again.");
      setDraft(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-30 flex flex-col items-end gap-3">
      {open && (
        <div
          role="dialog"
          aria-label="Jarvis chat"
          className="flex h-[420px] w-80 flex-col overflow-hidden rounded-2xl border border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] shadow-2xl"
        >
          <div className="flex items-center gap-2 border-b border-[var(--text,#eafcff)]/10 px-4 py-3">
            <Sparkles size={16} className="text-[var(--accent,#38e0ff)]" />
            <span className="text-sm font-semibold text-[var(--text,#eafcff)]">Jarvis</span>
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
            {messages.map((m) => (
              <div
                key={m.id}
                data-testid="jarvis-message"
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
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
              </div>
            ))}
          </div>
          {error && (
            <div role="alert" className="mx-3 mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-[var(--text,#eafcff)]">
              {error}
            </div>
          )}
          <div className="flex items-end gap-2 border-t border-[var(--text,#eafcff)]/10 p-3">
            <Textarea
              label="Message Jarvis"
              hideLabel
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={sending}
              rows={1}
              className="min-h-[40px] flex-1 resize-none"
            />
            <Button onClick={handleSend} disabled={sending} className="shrink-0">
              Send
            </Button>
          </div>
        </div>
      )}
      <button
        aria-label="Jarvis"
        onClick={() => setOpen((o) => !o)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent,#38e0ff)] text-[#04121a] shadow-2xl transition-transform hover:scale-105"
      >
        <Sparkles size={22} />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they still pass**

Run: `npm test -- tests/component/JarvisPanel.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add components/jarvis/JarvisPanel.tsx
git commit -m "feat: modernize JarvisPanel as a chat-bubble-styled widget"
```

---

### Task 11: Full regression — component suite, production build, e2e

**Files:**
- None (verification only).

- [ ] **Step 1: Run the full component/unit/integration suite**

Run: `npm test`
Expected: PASS — every test file, including the three new UI-primitive test files and all seven touched components' existing test files, zero regressions elsewhere.

- [ ] **Step 2: Run a production build**

Run: `npm run build`
Expected: compiles and type-checks cleanly. If it fails, fix the minimal type error found (do not change runtime behavior to work around a type-only issue) and re-run.

- [ ] **Step 3: Run the full e2e suite**

Run: `npm run test:e2e`
Expected: `foundation-flow.spec.ts`, `catchup-flow.spec.ts`, `forgot-password-flow.spec.ts` PASS. `ai-prioritization-flow.spec.ts` and `jarvis-flow.spec.ts` both make real Gemini API calls and may fail on external quota exhaustion (a known, pre-existing, unrelated condition — see `.superpowers/sdd/progress.md` from the previous sub-project) rather than anything this plan touches; if either fails, check the dev server log for a `429 RESOURCE_EXHAUSTED` or `503` from `generativelanguage.googleapis.com` before treating it as a regression.

- [ ] **Step 4: Report**

No commit for this task (verification only) — summarize the three results (component suite, build, e2e) to the user.
