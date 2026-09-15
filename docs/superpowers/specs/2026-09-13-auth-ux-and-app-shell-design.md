# Auth UX (Signup / Login / Forgot Password) + App Shell (Navbar/Sidebar) — Design

## Context

The Arc TODO app (Foundation + the three later sub-projects: AI Catch-Up,
AI Prioritization, Jarvis) is functionally complete but visually
unfinished in two specific places:

1. **Auth pages** (`app/(auth)/login`, `app/(auth)/signup`) render bare,
   unstyled native `<input>`/`<button>` elements, and there is no
   forgot-password flow at all — no route, no token model, no email
   infrastructure of any kind (`.env.example` has no mail provider key,
   `package.json` has no mail-sending dependency).
2. **There is no persistent app chrome.** `/canvas` renders the React Flow
   board directly with no navigation; `/recycle-bin` is reachable only by
   typing the URL. There is also no logout control anywhere in the UI —
   the only way to end a session today is to clear cookies. The theme
   mode, accent color, and AI model pickers currently float, unstyled, in
   the top-right corner of the canvas itself
   (`components/canvas/Canvas.tsx:483-499`).

This design covers restyling the auth pages, adding the forgot/reset
password flow, and introducing a Navbar + Sidebar app shell around the
authenticated routes. It does **not** cover restyling the crude components
that live inside the canvas board itself (`NewTaskButton`,
`NewThreadButton`, `ShareThreadDialog`, `CardMenu`, `CatchUpModal`,
`TaskDetailPanel`) — that surface is large enough to be its own follow-up
pass once this design's UI kit exists for it to build on.

## Approach

### UI primitives kit (`components/ui/`)

A small set of reusable, styled primitives, built on Tailwind v4 against
the existing theme CSS variables (`--background`, `--foreground`,
`--accent`, computed by `lib/theme.ts` and applied by
`ThemeProvider.tsx`) so every primitive automatically respects each
user's theme mode and accent color, the same way `.task-card` already
does in `globals.css`.

- `Button.tsx` — `primary` (accent-filled), `secondary` (bordered/ghost),
  and `danger` variants. Accepts a `loading` boolean that swaps the label
  for a spinner and disables the button, for use on form submits.
- `Input.tsx` — bordered text field wrapper around a native `<input>`,
  with an optional leading icon slot (a `lucide-react` icon component)
  and an optional password show/hide toggle (only rendered when
  `type="password"`). Forwards `name`, `placeholder`, `required`, etc.
  straight through so existing test selectors (`getByPlaceholder`,
  `getByLabel`) keep working unchanged.
- `Dropdown.tsx` — a floating menu anchored to a trigger button; closes on
  outside click or `Escape`. Used for the navbar's user menu. Not a
  general `<select>` replacement — native `<select>` stays in
  `ModelPicker`/permission pickers for now (those are canvas-board
  components, out of scope here) except where noted below.
- `FormAlert.tsx` — a styled banner (icon + text) for inline form errors,
  replacing bare `<p role="alert">{error}</p>`. Keeps `role="alert"` so
  existing/future tests can still find it by role.

New dependency: `lucide-react` (icons throughout — form fields, buttons,
nav items, user menu).

### Auth pages

`login/page.tsx` and `signup/page.tsx` are restyled in place using the
kit above: a centered card, icon-adorned fields (`Mail`, `Lock`, `User`
icons), a `Button` for submit, and a `FormAlert` for errors. Cross-links
are added ("Don't have an account? Sign up" / "Already have one? Log
in"), plus a "Forgot password?" link next to the password field on
login.

**Constraint carried over from the existing e2e test**
(`tests/e2e/foundation-flow.spec.ts`): the accessible names it depends on
— placeholders `"Name"`, `"Email"`, `"Password"` and the button text
`"Sign up"` — must not change. Styling and icons are added around these
elements, not instead of them.

### Forgot / reset password

No email provider exists in this project (confirmed: nothing in
`package.json` or `.env.example`). Per the chosen approach, the reset
link is revealed directly in the UI (and logged server-side) instead of
emailed — a documented dev-mode convenience, not a production posture.

**`app/(auth)/forgot-password/page.tsx`** (new): a single email field.
Submits to `requestPasswordReset(email)`. The confirmation view is
identical regardless of whether the account exists — always the generic
message ("If an account exists for that email, a reset link has been
generated") plus the returned reset URL in a clearly-labeled "Dev mode"
callout box, since `requestPasswordReset` always returns a URL-shaped
response now (see below — this was corrected mid-implementation from an
earlier draft that conditionally omitted the link). Links back to
`/login`.

**`app/(auth)/reset-password/page.tsx`** (new): reads `token` from
`searchParams` (typed as a `Promise`, per the Next.js 16 async
Request-API change documented in
`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`).
Renders a new-password + confirm-password form. Submits to
`resetPassword(token, newPassword)`. On success, shows a confirmation
with a link to `/login`; on failure (invalid/expired/mismatched-confirm),
shows a `FormAlert`.

**`app/actions/auth.ts`** gains:

```ts
export class PasswordResetError extends Error {}

export async function requestPasswordReset(
  email: string
): Promise<{ resetUrl: string }> { ... }

export async function resetPassword(
  token: string,
  newPassword: string
): Promise<void> { ... }
```

- `requestPasswordReset` normalizes the email and looks up the user. A
  32-byte random token (`crypto.randomBytes`) is generated unconditionally,
  and **always** returned as `{ resetUrl: "/reset-password?token=<raw
  token>" }` — for a matching account, its hash plus a 1-hour expiry are
  stored on the user row first; for no match, nothing is stored and the
  token is simply inert. This response never being `null` is a deliberate
  correction made during implementation: an earlier draft returned `{
  resetUrl: null }` for an unknown email, which made the response *shape*
  itself a user-enumeration oracle for any direct caller of the Server
  Action (not just the UI). Returning an identically-shaped URL either way
  closes that specific channel. The raw token is never persisted — only
  its hash. Note this does not eliminate enumeration end-to-end: since the
  link is revealed to the caller rather than emailed (the whole point of
  the dev-mode approach below), anyone holding a returned link can still
  learn account existence from `resetPassword`'s outcome. That residual
  risk is accepted as inherent to the dev-mode reveal for this project,
  not something this response shape can fix — see `app/actions/auth.ts`'s
  comments for the production guard this implies.
- `resetPassword` re-hashes the supplied token, looks up the user by
  `resetTokenHash`, rejects with `PasswordResetError` if there's no match
  or the stored `resetTokenExpiresAt` has passed, otherwise updates
  `passwordHash` (bcrypt, cost 12 — matching `signup`) and clears both
  reset columns so the token is single-use. Also rejects passwords under
  8 characters, matching `signup`'s existing rule.

### Data model

`prisma/schema.prisma`, on `User`:

```prisma
resetTokenHash      String?
resetTokenExpiresAt DateTime?
```

Both nullable, defaulting to unset. A migration
(`add_password_reset_token`) is added via Prisma's migration tooling.

### App shell — Navbar + Sidebar

**`app/(app)/layout.tsx`** (new route group): wraps the existing
`canvas` and `recycle-bin` pages, which move to
`app/(app)/canvas/page.tsx` and `app/(app)/recycle-bin/page.tsx`. Route
groups don't affect the URL, so both pages keep resolving at `/canvas`
and `/recycle-bin` — `middleware.ts`'s matcher (`/canvas/:path*`,
`/recycle-bin/:path*`) needs no change. This layout fetches the session
and the user's `themeMode`/`accentColor`/`preferredAiModel` once
(mirroring the pattern already used in the root `layout.tsx` and
`canvas/page.tsx`) and renders `Navbar` + `Sidebar` around `{children}`.

**`components/shell/Sidebar.tsx`**: fixed-width left column, icon +
label nav links for Canvas and Recycle Bin, active-route highlighting
via `usePathname()`. Not collapsible or responsive for now — the app is
a desktop-oriented canvas board, and a collapse/mobile mode can be added
later if needed (YAGNI for this pass).

**`components/shell/Navbar.tsx`**: app name on the left; a user-menu
(avatar circle with the user's initials) on the right, opening a
`Dropdown` containing the `ThemeToggle`, `AccentColorPicker`, and
`ModelPicker` controls, and a "Log out" item. Log out calls
`next-auth/react`'s `signOut()` and redirects to `/login`.

**Moving the settings controls out of `Canvas.tsx`**: tracing
`Canvas.tsx`'s data flow shows `localThemeMode`/`localAccentColor`/
`aiModel` state (lines 96-97, 133) and the `handleThemeChange` handler
exist solely to drive those three floating pickers — nothing else in the
file reads them. That whole block (state, handler, imports, and the
absolutely-positioned `<div>` at lines 483-499) is deleted from
`Canvas.tsx` and reconstructed as the navbar's user-menu content, reusing
the same `updateThemePreference`/`updatePreferredAiModel` server actions.
`ThemeToggle`, `AccentColorPicker`, and `ModelPicker` are restyled to fit
the dropdown menu, since they're relocating into new chrome built by this
design — this is the one deliberate exception to "canvas-board components
are out of scope."

### Testing

Following the project's existing test structure:

- **Component tests** (`tests/component/`): new tests for `Button`,
  `Input`, `Navbar` (active link + logout calls `signOut`), `Sidebar`,
  the forgot-password form, and the reset-password form — mirroring the
  style of existing tests like `ThemeToggle.test.tsx`.
- **Integration tests** (`tests/integration/auth.test.ts`): extend the
  existing file with cases for `requestPasswordReset` (returns a URL for
  an existing user, returns an equally URL-shaped response for a
  non-existent one without creating a user or storing a token, never
  returns the raw token in a form that skips hashing) and `resetPassword` (happy
  path actually changes the password, rejects an expired token, rejects
  an unknown token, rejects a too-short new password, and rejects reuse
  of an already-consumed token) — mirroring the existing `signup`
  describe block's structure.
- **E2E** (`tests/e2e/`): a new spec covering forgot-password → reveal
  dev-mode link → reset → log in with the new password. The existing
  `foundation-flow.spec.ts` is left untouched (its selectors are
  preserved by construction, per the constraint above) but re-run to
  confirm the shell/layout move doesn't break it.
