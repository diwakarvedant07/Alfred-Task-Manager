# AI-Assisted Prioritization — Design

## Context

This is sub-project 3 of the Arc TODO app (see the Foundation implementation
plan for the full multi-sub-project decomposition). Foundation (sub-project
1) shipped the base app with a manual `priority` field on `Task`
(`LOW`/`MEDIUM`/`HIGH`, editable via the task detail panel). Thread Memory &
AI Catch-Up (sub-project 2) added Google Gemini integration and a rolling
per-thread AI summary (`ThreadSummary`). This sub-project adds the second AI
feature: when a task is created, the AI suggests a priority for it, visibly
marked as an AI suggestion until the user manually overrides it — and the
AI's judgment is calibrated against the user's other threads by reading
their existing rolling summaries from sub-project 2, rather than duplicating
that summarization work.

Out of scope for this sub-project (deferred to sub-project 4 per the
Foundation plan's decomposition): the Jarvis central agent, per-thread
agents, and new-input thread-routing UX.

## Approach

### What gets suggested

A priority **level** per task (`LOW`/`MEDIUM`/`HIGH`, the existing
`TaskPriority` enum) — not a cross-task ranking/ordering. This fits the
existing data model exactly and matches the original product vision's own
wording ("AI-suggested priority").

### Trigger and latency

Suggestion happens automatically, once, when a task is created — not
on-demand and not re-triggered later. Task creation itself is untouched and
stays instant: `createTask` does not call the AI. Immediately after a
successful creation, the client fires a separate, **unawaited** call to a
new `suggestTaskPriority(taskId)` Server Action. The task appears right away
at the default `MEDIUM`; its priority (and an "AI" badge) updates in place
once the suggestion resolves, via the same per-task local-override mechanism
`components/canvas/Canvas.tsx` already uses for instant-feeling edits
(`taskEditOverrides`). If the AI call fails for any reason, it fails
silently — the task simply keeps its default `MEDIUM`. This is a background
enhancement, not a core action, and must never surface an error to the user
or block anything.

### Data fed to the suggestion

- The new task's own **title**, **description**, and **due date** — all
  three must be collectable at creation time for this to work, so
  `components/canvas/NewTaskButton.tsx` gains optional **description** and
  **due date** fields (currently title-only). Both remain optional; an
  empty description or missing due date is valid input to the prompt (the
  AI judges on whatever is actually provided).
- **Cross-thread calibration context**: up to the user's **10** other
  `ACTIVE` threads that already have a rolling `ThreadSummary` (from
  sub-project 2), ordered by most-recently-updated summary first — each
  contributing its thread name and current `summaryText`. Threads with no
  summary yet are skipped (not summarized specially for this purpose — no
  new summarization work is introduced by this sub-project). The task's
  *own* thread's other tasks are **not** included; calibration is
  cross-thread only, via existing summaries, not a fresh raw-task-list
  query.

### Suggestion generation

New Server Action `suggestTaskPriority(taskId: string): Promise<Task>`:
loads the task and its thread (for the permission check and the thread's own
name), gathers the calibration context above, builds a prompt via a new
pure `lib/priorityPrompt.ts` module, and calls `generateText(model, prompt)`
— the same Gemini wrapper sub-project 2 built — using the calling user's own
`preferredAiModel`, exactly as the catch-up feature already does. The prompt
instructs the model to answer with exactly one word: `LOW`, `MEDIUM`, or
`HIGH`. The response is parsed strictly (case-insensitive match against
those three tokens); anything else — empty, malformed, extra text the model
added despite instructions — falls back to `MEDIUM` rather than erroring or
leaving the task unset. On success, the action updates the task's
`priority` and sets `priorityIsAiSuggested: true`.

Permission-gated identically to `updateTask` (the caller needs edit access
to the task's thread via `lib/permissions.ts`'s `canManageTasks`) — the same
capability that already lets someone create/edit tasks in a thread.

No manual "re-suggest" UI is built in this sub-project — `suggestTaskPriority`
exists as a callable action, but the only caller in this sub-project's scope
is the task-creation flow, called exactly once per task's lifetime.

### Data model

- **`Task.priorityIsAiSuggested`** — new column, `Boolean @default(false)`.
  `true` only while the current `priority` value came from the AI and
  hasn't been manually changed since. `updateTask` sets this back to
  `false` whenever its patch includes a `priority` field at all (even if
  the new value happens to equal the old one) — any explicit manual set
  through the UI counts as an override. `suggestTaskPriority` is the only
  path that ever sets it to `true`.

### UI changes

- **`NewTaskButton`**: add optional description (textarea) and due date
  (date input) fields alongside the existing title field, passed through to
  `createTask` exactly as `TaskDetailPanel` already passes them to
  `updateTask` today.
- **`TaskNode`** (canvas card) and **`TaskDetailPanel`**: both show a small
  "AI" badge next to the existing priority badge/selector whenever
  `priorityIsAiSuggested` is `true`. The badge disappears the instant the
  user changes priority manually (since that flips the flag server-side on
  the next `updateTask` call) — no separate client-side dismiss action
  needed.

## Testing

- Unit tests for the prompt builder (`lib/priorityPrompt.ts`) and the
  response parser (exact `LOW`/`MEDIUM`/`HIGH` matches, case-insensitivity,
  and the `MEDIUM` fallback for anything else) as pure functions.
- Integration tests (Gemini mocked, never called for real) for
  `suggestTaskPriority`: permission gating; the prompt actually includes
  the calibration threads' summaries (proving the cross-thread context is
  real, not just the task's own fields); the 10-thread cap and
  most-recently-updated ordering; `priorityIsAiSuggested` set to `true` on
  success; a malformed AI response still results in a valid `MEDIUM`
  update rather than a thrown error.
- Integration test for `updateTask`: confirms `priorityIsAiSuggested` flips
  to `false` whenever `priority` is included in the patch.
- Component tests for the new `NewTaskButton` fields and the "AI" badge
  rendering on `TaskNode`/`TaskDetailPanel` (present when the flag is true,
  absent when false).
- End-to-end test: create a task with a title/description/due date, confirm
  it appears immediately, confirm the AI badge and a real (mocked in CI,
  but exercised live in manual verification) priority appear shortly after
  without a page reload, then manually change the priority and confirm the
  badge disappears.
