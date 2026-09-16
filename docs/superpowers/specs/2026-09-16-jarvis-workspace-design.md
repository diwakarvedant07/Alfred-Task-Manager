# Jarvis Workspace Redesign — Design Spec

## Goal

Replace Jarvis's small bottom-right popup with a full-screen, Claude-like
workspace: a left sidebar of chat sessions, a center chat pane, and the
existing canvas visible on the right. Add per-session token-usage tracking,
a loading indicator while waiting on a reply, and a themed scrollbar.

## Background

Today, `JarvisPanel.tsx` is both the floating trigger button and a small
`380x420px` popup dialog. All of a user's Jarvis messages live in one flat,
continuous history (`JarvisMessage.userId`, no session concept) — there is
no way to start a fresh conversation or see past ones separately. The popup
has no loading state (the composer just disables during the request), no
token-usage visibility, and its message list uses the browser's default
scrollbar.

Two upstream issues are already fixed and out of scope here: the dead
`gemini-2.5-flash` model ID (`User.preferredAiModel` is per-account and
already corrected) and next-auth's `trustHost` (fixed in `lib/auth.ts`).
This redesign assumes Jarvis's underlying request/response plumbing
(`generateWithTools`, the 4-round tool-calling loop, the 5 existing tools)
works and is unchanged — only the request now happens per-session.

## Architecture

```
JarvisPanel.tsx (floating trigger button only)
  → opens →
JarvisWorkspace.tsx (fixed inset-0 z-[110] full-viewport overlay)
  ├── JarvisSessionList.tsx (left)
  ├── JarvisChat.tsx (center)
  └── the existing <ReactFlow> canvas (right — same mounted instance,
      resized via CSS, not remounted)
```

`Canvas.tsx` currently renders the toolbar, `<ReactFlow>`, `CatchUpModal`,
the `TaskDetailPanel` rail, and `JarvisPanel` as siblings inside one
`position: relative` wrapper. This changes so the `<ReactFlow>` block and
`JarvisWorkspace` sit inside a flex row whose proportions are driven by
whether the workspace is open — the same `<ReactFlow>` element just shrinks
into the right ~35% of the viewport rather than unmounting, so zoom/pan
state and node data survive opening and closing Jarvis.

`CatchUpModal` stays at `z-[100]`; `JarvisWorkspace` opens above it at
`z-[110]` (opening Jarvis while a catch-up summary is showing must still
be possible — closing the workspace returns to whatever was on screen
underneath, catch-up included).

## Data model

Two changes to `prisma/schema.prisma`:

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
  id                String            @id @default(cuid())
  sessionId         String
  session           JarvisSession     @relation(fields: [sessionId], references: [id])
  userId            String
  user              User              @relation(fields: [userId], references: [id])
  role              JarvisMessageRole
  content           String
  toolCalls         Json?
  promptTokens      Int?
  completionTokens  Int?
  totalTokens       Int?
  createdAt         DateTime          @default(now())

  @@index([sessionId, createdAt])
}
```

`userId` stays on `JarvisMessage` (redundant with `session.userId`, but
matches the existing pattern elsewhere in this schema of denormalizing the
owner onto child rows for simpler permission checks, and avoids a join on
every permission-relevant query). Token fields are nullable: only set on
`ASSISTANT` messages that completed a real Gemini round trip; null on
`USER` messages and on the fallback-error-text message (partial per-round
usage before a mid-loop failure isn't reliably attributable to "this
reply," so it's left unset rather than guessed at).

**Migration**: existing `JarvisMessage` rows have no `sessionId` to backfill
from and are not migrated into a session — per explicit decision, old
Jarvis history is dropped. The migration drops and recreates
`JarvisMessage` with the new required `sessionId` column (acceptable: this
is dev-only data, no production deployment exists).

A single `sendJarvisMessage` turn can make up to 4 Gemini calls (the
existing tool-calling loop). The assistant message's token fields are the
**sum** of every round's `usageMetadata.{promptTokenCount,
candidatesTokenCount, totalTokenCount}` in that turn — "what this reply
cost," not a single API call's numbers.

## Server actions

New file `app/actions/jarvisSessions.ts`:

- `createJarvisSession(): Promise<{ id: string; title: string | null }>` —
  creates an empty session (`title: null`), returns it.
- `listJarvisSessions(): Promise<{ id: string; title: string | null; updatedAt: Date }[]>` —
  current user's sessions, `updatedAt` desc.
- `renameJarvisSession(sessionId: string, title: string): Promise<void>` —
  ownership-checked; an empty/whitespace-only `title` clears it back to
  `null` (falls back to auto-title display, not stored as an empty string).
- `deleteJarvisSession(sessionId: string): Promise<void>` — ownership-checked;
  cascades to its messages (`onDelete: Cascade` on the FK).
- `listJarvisMessages(sessionId: string): Promise<JarvisMessageView[]>` —
  ownership-checked; full message history for one session (for loading a
  session when the user switches to it — separate from the last-20 slice
  replayed to Gemini as model context).

Modified in `app/actions/jarvis.ts`:

- `sendJarvisMessage(sessionId: string, content: string)` — every
  existing behavior (4-round tool loop, chip logging, fallback error text,
  last-20-messages-as-context) stays exactly the same, now scoped by
  `sessionId` instead of `userId` for both the history query and the new
  message's `sessionId`. After creating the assistant message, if the
  session's `title` is still `null`, set it to the first ~48 characters of
  the user's message (word-boundary-trimmed, `…` appended if truncated) in
  the same transaction.

## Page data loading

`app/(app)/canvas/page.tsx` stops fetching `jarvisMessages` (the flat
50-message slice) and instead fetches the session list (cheap: id/title/
updatedAt only) via the same query `listJarvisSessions` runs, passed to
`Canvas` as `initialJarvisSessions`. `JarvisWorkspace` calls
`listJarvisMessages(sessionId)` when a session is opened/switched to
(client-side, on demand) rather than the page preloading every message
upfront.

## Components

**`JarvisPanel.tsx`** (shrinks): just the floating trigger button —
`aria-label="Jarvis"`, `Sparkles` icon, `fixed bottom-4 right-4`. Its
`onClick` sets `open` state that mounts `JarvisWorkspace`. No more inline
message list, composer, or dialog markup.

**`JarvisWorkspace.tsx`** (new): the `fixed inset-0 z-[110]` shell.
Owns `activeSessionId` state (null = no session selected / "new chat"
composer-only state), fetches the session list on mount, closes on
Escape or a close button (top-right, `X` icon, `aria-label="Close"`,
matching `TaskDetailPanel`'s convention) — closing does not delete
anything, just unmounts the overlay.

**`JarvisSessionList.tsx`** (new): "New chat" button at top
(`Button` primary, `Plus` icon); below it, a scrollable list of session
items — each shows title (or "New chat" placeholder if `title` is
`null`), relative last-active time, and a hover-revealed pair of icon
buttons (`Pencil` for rename → inline text input replacing the title on
click, `Trash2` for delete — no confirmation dialog, matching this app's
existing pattern for thread/task deletion elsewhere). The active session
is highlighted
(`bg-[var(--accent,#38e0ff)]/10`).

**`JarvisChat.tsx`** (new): header bar (session title, editable inline the
same way as the sidebar's rename; running token total, e.g. "1,284
tokens"); scrollable message list (each bubble shows role, content, tool
chips exactly as today, plus a small `text-[var(--text,#eafcff)]/50`
token count under assistant messages, e.g. "142 tokens"); a three-dot
pulsing "Jarvis is thinking…" bubble appended immediately on send and
removed when the real reply (or fallback error) arrives; composer
(`Textarea` + `Button`) unchanged in behavior from today. The message
list gets a themed scrollbar (`scrollbar-width: thin` +
`scrollbar-color` for Firefox, `::-webkit-scrollbar{width:...}` +
`::-webkit-scrollbar-thumb{background:...}` for Chrome/Edge) and
auto-scrolls to the bottom on new messages.

**Canvas.tsx**: the `<ReactFlow>...</ReactFlow>` block's wrapping element
gets a conditional class (full width when the workspace is closed, ~65%
width pinned right when open) instead of being a static-width sibling;
`JarvisPanel` stays rendered as today (just renders the trigger now); a
new `jarvisWorkspaceOpen` boolean state in `Canvas.tsx` (lifted up from
`JarvisPanel`, since it now needs to affect the canvas's own layout)
controls both.

## Error handling

- Deleting the currently-open session: `JarvisWorkspace` falls back to the
  most recently updated remaining session, or the empty "new chat"
  composer-only state if none remain.
- Renaming to empty/whitespace: reverts to auto-title (stores `null`, not
  `""`).
- A failed Jarvis reply (network/rate-limit/dead-model — anything caught
  by the existing `catch { finalText = FALLBACK_ERROR_TEXT }` in
  `jarvis.ts`) still persists and displays exactly as today, just with
  null token fields on that message (no token line rendered for it).
- Every new/modified server action re-checks `session.userId` against the
  session/message's owner, following this codebase's existing permission
  pattern (`PermissionError` on mismatch), the same way
  `listThreadShares`/`revokeThreadShare` check thread ownership.

## Testing

- **Schema**: a `tests/integration/schema-jarvis.test.ts`-style test
  (this file already exists for the current shape and gets updated)
  covering the new `JarvisSession` model and `JarvisMessage`'s new
  columns/FK.
- **Integration** (`tests/integration/jarvisSessions.test.ts`, new):
  create/list/rename/delete session actions against the real test DB,
  ownership checks, cascade-delete of messages.
- **Integration** (`tests/integration/jarvis.test.ts`, modified): every
  existing `sendJarvisMessage(...)` call becomes
  `sendJarvisMessage(sessionId, ...)`; the "last 20 messages" test scopes
  its 25 seeded messages to one session; new tests for token-field
  summation across multi-round turns and auto-title-on-first-message.
  Gemini itself stays mocked via `vi.mock("@/lib/gemini", ...)`, matching
  the existing convention — no real API calls in tests.
- **Component**: `JarvisSessionList.test.tsx` (create/rename/delete
  interactions, active-session highlighting), `JarvisChat.test.tsx`
  (loading bubble appears on send and disappears on reply, token count
  renders per assistant message and as a running header total, scoped
  query for the loading bubble uses a testid since "Jarvis is thinking…"
  is exactly the kind of ambiguous text a future icon-only redesign could
  break), `JarvisWorkspace.test.tsx` (Escape and close-button both close
  it; switching sessions loads that session's messages).
  `JarvisPanel.test.tsx` shrinks to just the trigger-button test.
- **E2e** (`tests/e2e/jarvis-flow.spec.ts`, rewritten): opens the
  workspace instead of the small popup, drives the new session-list UI
  (new chat → send a message → thread/task appear on canvas, matching
  today's assertion) — still real-API, still `retries: 2` for the
  documented Gemini free-tier flakiness.

## Out of scope

- AI-generated session titles (truncation only, per decision above).
- Scoping the right-side canvas to only the active session's thread(s)
  (shows the full canvas, same as today, per decision above).
- Migrating pre-existing Jarvis message history into sessions (dropped,
  per decision above).
- Exporting/searching past sessions, pinning sessions, or any session
  metadata beyond title/timestamps.
- Cost estimates in dollars — token *counts* only, no per-model pricing
  table.
