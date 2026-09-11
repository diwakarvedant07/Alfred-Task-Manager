# Thread Memory & AI Catch-Up — Design

## Context

This is sub-project 2 of the Arc TODO app (see the Foundation implementation
plan, `docs/superpowers/plans/2026-09-11-foundation-implementation-plan.md`,
for the full multi-sub-project decomposition and rationale). Foundation
shipped the data model, canvas, sharing, and theming with no AI behavior at
all — this sub-project adds the first AI feature: when a user reopens a
thread they haven't looked at in a while, Arc shows them an AI-generated
catch-up of what happened while they were away, so they can resume paused
work without re-reading everything from scratch.

Out of scope for this sub-project (deferred to sub-projects 3 and 4 per the
Foundation plan's decomposition): AI-assisted task prioritization, and the
Jarvis central agent / per-thread agents / thread-routing UX. This
sub-project only builds thread-level summarization and the catch-up trigger.

## Approach

### Provider & model

Google Gemini via the `@google/genai` SDK (`GoogleGenAI` client,
`ai.models.generateContent({ model, contents, config })`), not Claude/Anthropic
— an explicit choice for this sub-project. The API key is read from the
`GEMINI_API_KEY` environment variable, supplied the same way this project's
other secrets (`AUTH_SECRET`, `PURGE_SECRET`) already are.

Each user picks their own model via a new `preferredAiModel` field (default
`"gemini-2.5-pro"`), settable from a `ModelPicker` control in the existing
canvas settings strip (next to `AccentColorPicker`/`ThemeToggle`). The picker
offers two presets — `gemini-2.5-pro` (quality) and `gemini-2.5-flash`
(speed/cost) — plus a free-text field for typing in any other Gemini model
ID directly, so a newer release doesn't require a code change.

### Data model

- **`ThreadView`** — `threadId`, `userId`, `lastViewedAt`. Composite primary
  key `(threadId, userId)`, mirroring how `TaskPosition` already tracks
  per-(task, user) state. Tracks when THIS user last viewed THIS thread —
  staleness is personalized per user, not global to the thread, so a
  co-worker's daily activity on a shared thread doesn't stop it from
  catching you up personally if you haven't looked in a while.
- **`ThreadSummary`** — `threadId` (unique — one row per thread), `summaryText`,
  `lastIncludedAt` (a cursor: the point up to which activity has already
  been folded into `summaryText`), `updatedAt`. This is a single rolling
  summary shared by every collaborator on the thread — it is not
  regenerated from scratch each time, it is *extended*: each regeneration
  call is given the previous `summaryText` plus only the activity newer
  than `lastIncludedAt`, and asked to fold the new activity into the
  existing narrative.
- **`User.preferredAiModel`** — new column, default `"gemini-2.5-pro"`.

### Trigger & staleness

- Clicking a thread's bubble on the canvas (not its "⋮" menu) calls a
  Server Action that looks up this user's `ThreadView.lastViewedAt` for
  that thread.
- **Staleness threshold: 24 hours.** If it's been more than 24 hours since
  this user personally last viewed the thread, it's stale. A thread the
  user has never viewed before is never "stale" — there's nothing to catch
  up on the first time you see a thread.
- The action always upserts `ThreadView.lastViewedAt` to now, whether or
  not the thread was stale.
- On a stale reopen, **the catch-up modal always appears** — even if
  nothing changed since the last summary, in which case the existing
  `summaryText` is simply re-shown with no new Gemini call. A regeneration
  call only happens when there's genuinely new activity since
  `lastIncludedAt` — cost scales with actual activity, not with how often
  people revisit. "New activity" is defined precisely as: any task in the
  thread with `createdAt > lastIncludedAt` (new task), any `TaskUpdate` on
  a task in the thread with `createdAt > lastIncludedAt` (new comment), or
  any task in the thread with `updatedAt > lastIncludedAt` (a field
  changed — Foundation's schema has no per-field change history, so the
  summary prompt is given the task's current title/status/priority/due
  date rather than an exact diff of what changed).
- **First-ever summary / genuinely empty thread:** if `ThreadSummary`
  doesn't exist yet and the thread has no tasks and no comments at all,
  skip the Gemini call and show the modal with a fixed "Nothing to catch
  up on yet" message rather than calling the model on nothing. If
  `ThreadSummary` doesn't exist yet but the thread already has history,
  the first regeneration summarizes that entire existing history (there is
  no previous summary to extend).

### UI

- **`CatchUpModal`** — full-screen modal. Shows a loading state while a
  regeneration call is in flight (if one is needed), then the summary text,
  with a close/"Got it" button.
- **Thread "⋮" menu** gains a **"View catch-up"** item — read-only, shows
  whatever `ThreadSummary` currently exists (or "Nothing to catch up on
  yet" if none exists) via a separate action with no side effects: it does
  not update `ThreadView` and never triggers a Gemini call. This lets
  anyone check the current summary at any time, independent of the
  automatic stale-reopen trigger.
- **`ModelPicker`** — a dropdown (the two presets) plus a text input for a
  custom model ID, wired to a new `updatePreferredAiModel` Server Action,
  rendered next to the existing theme controls. The action validates only
  that the submitted value is a non-empty string (Gemini model IDs aren't a
  fixed enumerable set, so unlike `accentColor`'s hex-format check there's
  no format to validate against beyond that) — an invalid/nonexistent
  model ID surfaces as a failed Gemini call at generation time, not at
  save time.

### Permissions

Both the trigger action and the read-only "view catch-up" action require at
least Viewer-level access to the thread (`canViewThread` from
`lib/permissions.ts`, the same gate `taskPositions.ts` already uses) —
consistent with the rest of the app, no new permission tier is introduced.

## Testing

- Unit tests for the staleness check (`isThreadStale(lastViewedAt, now)`,
  boundary at exactly 24h) and the "has new activity since cursor" query
  logic, as pure/isolated functions where possible.
- Integration tests with the Gemini call mocked (tests must not hit the
  real API or incur cost): `ThreadView` upserts correctly on every view;
  `ThreadSummary` regenerates only when new activity exists since
  `lastIncludedAt`, and is reused as-is otherwise; the prompt sent to
  Gemini genuinely includes the previous summary text (proving this is an
  extension, not a from-scratch resummarization); permission gating on
  both the trigger and read-only actions.
- Component tests for `CatchUpModal` and `ModelPicker`, following the
  existing controlled-component test pattern (e.g. `AccentColorPicker.test.tsx`).
