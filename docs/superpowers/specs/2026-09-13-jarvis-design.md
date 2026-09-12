# Jarvis (Central Agent + New-Input Routing) — Design

## Context

This is sub-project 4, the final piece of the Arc TODO app's original
decomposition (see the Foundation implementation plan). Foundation shipped
auth/canvas/data model. Thread Memory & AI Catch-Up (sub-project 2) gave
every thread a rolling Gemini-generated summary and a staleness-triggered
catch-up modal. AI-Assisted Prioritization (sub-project 3) added automatic
AI-suggested task priority calibrated against those summaries. This
sub-project adds the one deferred capability: a conversational agent the
user hands free-form input to, which decides — and acts — on where that
input belongs (an existing thread, a new thread, a comment on an existing
task, a status/priority change), rather than the user manually picking a
thread and filling out a form every time.

The original vision described "a central Jarvis agent plus one agent per
thread." Given sub-projects 2 and 3 already gave every thread its own
AI-maintained summary and prioritization, a *separate* per-thread agent
construct would duplicate that: this design has one central agent (Jarvis)
whose tools are simply thread/task-scoped, reading and writing the same
`ThreadSummary` and task data the earlier sub-projects already produce and
maintain. There is no separate per-thread agent process or loop.

## Approach

### Interaction model

A persistent, collapsible chat panel on the canvas page
(`components/jarvis/JarvisPanel.tsx`) — not a one-shot command bar. The
user types free-form messages; Jarvis replies conversationally and, where
appropriate, takes action immediately (creates a task, logs a comment,
etc.) rather than always asking for confirmation first. Because every
action Jarvis takes is a normal, user-visible, undoable operation on the
canvas (a task that can be moved, edited, or deleted; a comment that's just
part of the task's update log), "act now, let the user correct it after" is
the right default — consistent with how AI-suggested priority already
works (visible, overridable, never blocking).

If Jarvis is genuinely unsure — the input doesn't clearly match any
existing thread and isn't clearly novel enough to justify a new one — it
asks a clarifying question in the chat rather than guessing. This isn't a
special code path: it's just what "reply conversationally" naturally
produces when the model itself is uncertain, driven by prompt instruction
rather than a separate confidence-threshold mechanism.

### Tool-calling mechanism

Gemini's native function-calling (tool use), via `@google/genai` — no
separate agentic loop, no MCP server process. One Gemini call per user
message, with:

- **Context injected every turn**: the user's own threads (id, name,
  current `ThreadSummary` text if any), using the same bounded,
  most-recently-updated-first query pattern `lib/threadCalibration.ts`
  already implements for sub-project 3's calibration (capped at 10, same
  ACTIVE-thread + ownership/sharing scope) — reused, not reimplemented,
  minus the "exclude current thread" filter (there is no current thread
  here).
- **One on-demand read tool**, `findTasks(query: string)`: a lightweight
  text search over the user's own + shared tasks (title/description
  match), so Gemini can resolve "finished the vendor call" to a specific
  existing task without every task being dumped into context on every
  turn.
- **Four write tools**, each a thin wrapper around an *existing* Server
  Action, so permission enforcement is inherited for free rather than
  reimplemented:
  - `createTaskInThread(threadId, title, description?, dueDate?)` →
    `createTask`, followed by the same fire-and-forget
    `suggestTaskPriority` call every other task creation already gets.
  - `createThreadWithTask(threadName, categoryColor?, title, description?, dueDate?)`
    → `createThread` then `createTask`, for input that doesn't fit any
    existing thread.
  - `addTaskUpdate(taskId, body)` → the existing task-comment/update
    action.
  - `updateTaskFields(taskId, status?, priority?)` → existing `updateTask`
    (manual-override semantics — e.g. `priorityIsAiSuggested` clears —
    apply exactly as they already do for any other caller of `updateTask`).
- Gemini may call zero, one, or several tools in one response (native
  parallel tool-call support) before producing its natural-language reply.
  Each executed tool call is recorded (tool name + resolved arguments +
  success/failure) alongside the reply so the UI can render a small
  confirmation chip per action ("✓ Created task 'Call vendor about Q3
  invoice' in Q3 Report").
- **Permission boundary**: every tool is a pass-through to an already
  permission-gated action. A tool call against a thread/task the user
  can't edit throws the same `PermissionError` any other caller would get;
  Jarvis reports this back conversationally ("I can't add tasks to that
  thread — you only have view access there") rather than crashing or
  failing silently. This differs deliberately from sub-project 3's silent
  fire-and-forget failure: there, the user isn't watching a specific call
  resolve; here, they just sent a message and are waiting on a reply, so a
  swallowed failure would be actively confusing.

### Data model

- **`JarvisMessage`** — new model: `id`, `userId` (FK), `role` (`USER` |
  `ASSISTANT`), `content` (text), `toolCalls` (JSON, nullable — the
  structured action log described above, empty/absent for plain replies
  with no action taken), `createdAt`. One continuous append-only log per
  user, not split into separate named conversations — consistent with
  there being one canvas per user.
- **Bounded history sent to the model**: only the most recent ~20 messages
  from this log are included as conversation history in each Gemini call
  — not the entire ever-growing log. The full log still renders in the UI
  on scroll-back; this cap only bounds what's re-sent to Gemini per turn,
  the same reasoning as the calibration thread cap (bounded, predictable
  token cost as usage grows over time).

### UI

- `components/jarvis/JarvisPanel.tsx`: a collapsible sidebar on the canvas
  page (toggle button in the existing HUD chrome). Chat bubbles for
  user/assistant turns; a small text input + send control; each assistant
  reply that took action renders inline confirmation chips beneath it
  (one per tool call, success or failure).
- New Server Action `sendJarvisMessage(content: string): Promise<{ userMessage: JarvisMessage; assistantMessage: JarvisMessage }>`,
  called **awaited** from the panel (not fire-and-forget — the user is
  directly waiting on this reply). On a Gemini-call failure (network,
  rate limit, dead model), the action still persists the user's message,
  persists a visible error-flavored assistant message ("Something went
  wrong — try again"), and returns normally rather than throwing — so the
  chat always shows *something* in response to what the user sent,
  matching the review lesson from sub-project 3 that a silently-broken AI
  path can go unnoticed for an entire sub-project.

## Testing

- Unit tests for the tool-schema builder (pure function turning the four
  write tools + `findTasks` into Gemini's function-declaration format) and
  for parsing a Gemini tool-call response into typed, validated arguments.
- Integration tests for `sendJarvisMessage` (Gemini mocked, returning
  canned tool-call responses — never a real network call in this tier):
  permission gating per tool (a viewer-only thread rejects
  `createTaskInThread`, surfaced as a chat-visible error rather than a
  thrown exception); `findTasks` search correctness; handling multiple
  tool calls returned in one Gemini response; `JarvisMessage` persistence
  for both roles including the tool-call log; the ~20-message history cap
  is actually applied to what's sent to Gemini, not the full log.
- Component tests for `JarvisPanel`: message rendering, per-action
  confirmation chips, and the visible error state on a Gemini failure.
- End-to-end test (real Gemini API, same pattern as sub-project 3's
  `ai-prioritization-flow.spec.ts`): a message that should create a task
  in an existing thread → task appears on the canvas; a message that
  should log a comment on an existing task; a permission-denied case
  (message directed at a thread the signed-in user can't edit) renders as
  a chat error rather than crashing the panel.
- Pre-implementation research step: verify `@google/genai`'s *current*
  tool-calling/function-declaration API shape directly against the live
  SDK before writing any tool-dispatch code — this project already had to
  correct a stale assumption about Gemini model IDs this week by verifying
  live against the real API rather than trusting docs or training data;
  tool-calling is a surface of this same SDK this codebase hasn't
  exercised yet, so the same discipline applies before, not after,
  something breaks silently in production.
