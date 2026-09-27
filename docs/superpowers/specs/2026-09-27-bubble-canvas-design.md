# Bubble Canvas & Jarvis Launch Transition — Design

## Context

The canvas today is a React Flow board with two discrete zoom tiers
(`components/canvas/zoomTier.ts`): above zoom 0.6 every task renders as a
free-form draggable card (`TaskNode`), below it every thread renders as a
pill (`ThreadBubbleNode`) at the centroid of its tasks. The swap happens in
`onMoveEnd` (`Canvas.tsx` `handleMoveEnd`), so every zoom gesture that
crosses the threshold ends in a hard, un-animated replacement of the whole
node set. Users find the view not useful on either desktop or mobile: zoom
feels jerky, the task ↔ thread transition is a jump cut, and the free-form
card layout drifts into loose, unreadable piles. Phones avoid the problem
by defaulting to a list view.

This sub-project replaces the two-tier board with a bubble canvas where
expanding and collapsing threads is click-driven and continuously
animated, and zoom is purely a camera operation. It also adds a
shared-element launch animation from the "Ask Jarvis" button into the
Jarvis workspace.

## Decisions (from brainstorming)

- **Expand model:** click-driven. Zoom/pan only moves the camera. Tapping a
  thread bubble blooms it into its task cluster; the center × bubble
  collapses it. Multiple threads may be open at once.
- **Positioning:** users drag threads only; thread positions are saved per
  user. Task bubbles inside a cluster are auto-packed. Per-task positions
  stop being used by the canvas.
- **Mobile:** bubble canvas becomes the phone default; the List/Canvas
  toggle stays.
- **Priority encoding:** every bubble in a cluster is filled with its
  thread's category color; priority is shown as `!` / `!!` / `!!!` plus
  bubble size (HIGH largest).
- **Status:** DONE tasks stay in the cluster, faded with a check, on the
  outer ring. IN_PROGRESS tasks get a subtly pulsing outline. The collapsed
  thread bubble shows a done/total progress ring; its `!` counts include
  unfinished tasks only.
- **Approach:** keep React Flow for the camera; render one node per thread
  that animates its own cluster internally with framer-motion (already a
  dependency).

## Architecture

### Removed

- `components/canvas/zoomTier.ts`, the `tier` state, `handleMoveEnd`'s tier
  swap, and the `initialTier` prop on `Canvas`.
- `TaskNode` and `ThreadBubbleNode` as React Flow node types (files deleted
  along with their component tests; `TaskListView` does not use them).
- `computeThreadCentroid` from `components/canvas/layout.ts` (and its unit
  test cases). `computeInitialTaskOffset`/`computeInitialThreadOffset` stay:
  `app/actions/tasks.ts` still uses them to seed a `TaskPosition` on task
  creation, which is harmless and left unchanged. `tests/unit/zoomTier.test.ts`
  is deleted with `zoomTier.ts`.
- The canvas no longer reads `TaskPosition` rows or calls
  `saveTaskPosition`. Existing rows and the action stay untouched.

### New / changed units (`components/canvas/`)

| Unit | Responsibility |
|---|---|
| `ThreadClusterNode.tsx` | The only React Flow node type (`threadCluster`). Props via `data`: thread, its tasks, `open`, handlers, permission flags. Renders the collapsed bubble and the open cluster in one component tree and animates between them with framer-motion. |
| `ThreadDashboard.tsx` | Content of the collapsed bubble: thread name, `!!!`/`!!`/`!` counts of unfinished tasks, done/total progress ring, `⋯` menu button. |
| `TaskBubble.tsx` | One task bubble: title (clamped to 2 lines; 1 line on outer rings of large clusters), `!` marks, thread-color fill, radius by priority, DONE faded + check, IN_PROGRESS pulsing outline. Click opens `TaskDetailPanel`; long-press/right-click opens the existing `CardMenu` (rename, move, link, delete). |
| `clusterLayout.ts` | Pure: `(tasks) → { bubbles: {id, x, y, r}[], radius }`, coordinates relative to the cluster center. Packs bubbles in concentric rings around the × bubble with no overlaps. Unfinished tasks fill inner rings sorted HIGH → MEDIUM → LOW (stable by title within a priority); DONE tasks go on the outermost ring(s). Radii: HIGH 34, MEDIUM 29, LOW 24 (canvas units; minimum rendered diameter 48px at zoom 1). Always includes a trailing "+ Add task" slot for users who can edit. |
| `threadLayout.ts` | Pure: default grid position for threads with no saved `ThreadPosition`, spaced so a typical open cluster doesn't overlap neighbors. |
| `useOpenThreads.ts` | Client hook: set of open thread ids plus an ordered "most recently opened" stack (for Esc), persisted to `localStorage` per user id, all access wrapped in try/catch (falls back to all-closed). |

`Canvas.tsx` builds one `threadCluster` node per thread, positioned from
saved `ThreadPosition` or `threadLayout` defaults.

### Data

- New Prisma model, additive migration (no reset):

  ```prisma
  model ThreadPosition {
    threadId  String
    userId    String
    thread    Thread @relation(fields: [threadId], references: [id])
    user      User   @relation(fields: [userId], references: [id])
    positionX Float
    positionY Float

    @@id([threadId, userId])
  }
  ```

  Mirrors `TaskPosition`. Back-relations added on `Thread` and `User`.
- New server action `saveThreadPosition(threadId, x, y)` in
  `app/actions/threadPositions.ts`: requires auth and at least VIEWER access
  to the thread (a viewer's position only affects their own view); upserts.
- `app/(app)/canvas/page.tsx` loads the caller's `ThreadPosition` rows
  instead of `TaskPosition` rows and passes `threadPositions` to `Canvas`.

## Interaction & animation

### Opening a thread (one continuous animation)

1. Click/tap the collapsed bubble. The dashboard content fades while the
   bubble shrinks toward the center and morphs into the × bubble (same
   element, animated size/radius/content).
2. Task bubbles mount at the center at scale 0 and spring to their
   `clusterLayout` positions, staggered ~25 ms in layout order (HIGH first).
3. Simultaneously the camera eases to the cluster via React Flow
   `setCenter(x, y, { zoom, duration: 500 })`, where `zoom` is the larger of
   the current zoom and the zoom needed to fit the cluster radius (with
   padding) in the viewport — i.e. it only zooms in if needed, otherwise
   pans. Phones use tighter padding so the whole cluster fits.
4. Opening a thread also triggers the existing catch-up check
   (`openThreadAndMaybeGetCatchUp`) and modal, as clicking a bubble does
   today.

### Closing

Reverse of opening: bubbles spring back to the center and scale to 0 (reverse
stagger), × morphs back into the dashboard. The camera does not move.

### Interruptibility

All motion uses framer-motion springs that animate from current values. A
close issued mid-open (or vice versa) reverses smoothly from wherever the
elements are; nothing snaps.

### Zoom & pan

Purely React Flow (wheel, pinch, `Controls` +/−, `fitView`). No state
changes at zoom thresholds, so zooming never re-renders nodes into a
different shape. Controls and `fitView` animate (~300 ms).

### Multiple open threads

Allowed. The node's size tracks the open cluster radius. An open (or
hovered/focused) cluster renders above others (`zIndex`), and closed
neighbors overlapped by it dim to 50% opacity while it is hovered/focused.
Neighbors never auto-move.

### Dragging

Threads are draggable open or closed, via the collapsed bubble or the open
cluster's background/× (task bubbles are not drag handles —
`nodrag` class). On drag stop, `saveThreadPosition` is fired and failures
are swallowed (the thread stays where dropped for the session).

### Thread menu

The existing thread menu items (rename, change color, view catch-up, close,
delete — gated by `canEditMeta` / `canCloseOrDelete` exactly as today) move
to a `⋯` button on the collapsed bubble; while open, the same menu is
available by long-press/right-click on the × bubble. Sharing stays in
`ThreadsPanel`. `ThreadsPanel`'s "focus thread" now opens that thread's
cluster (and pans to it) instead of switching tiers.

### Empty & large threads

- Empty thread: collapsed bubble reads "No tasks"; opened cluster shows the
  × and the "+ Add task" bubble only (reuses the `NewTaskButton` flow).
- Large threads (40+): more rings; outer-ring titles clamp to 1 line; the
  camera fit uses the returned radius.
- Tasks added/changed/removed while open (Jarvis, refresh, edits): layout
  recomputes; bubbles are keyed by task id so they glide to new positions
  (framer-motion `layout`), new ones pop in, removed ones shrink out.

### Mobile

Canvas is the default phone view (`mobileView` initial state becomes
`"canvas"`); the List/Canvas toggle stays. All hit targets ≥ 44px
(smallest task bubble 48px diameter at the default phone zoom; × hit area
52px). Pinch-zoom is React Flow's. The initial `fitViewOptions` no longer
needs the phone `minZoom` clamp (no tiers).

### Reduced motion

Under `prefers-reduced-motion: reduce`, springs become ~150 ms opacity
crossfades and camera moves use `duration: 0`.

### Accessibility & keyboard

Collapsed bubbles, task bubbles, and the × are focusable `button`s. Enter/
Space activates. Esc closes the most recently opened cluster (ignored when a
modal dialog is open or focus is in a text field, matching the existing
"J" shortcut guard). Labels, e.g. collapsed: "Launch — 2 high, 3 medium,
2 low open, 1 done. Open thread"; task: "Ship API, high priority, in
progress"; ×: "Close Launch".

## Jarvis launch transition

Today `JarvisPanel` (floating orb button) toggles `JarvisWorkspace`, which
appears with a plain fade (desktop: left region, canvas shrinks into a right
strip; phone: full screen).

- New `components/jarvis/JarvisLauncherTransition.tsx` wraps
  `JarvisWorkspace`. On open it captures the launcher button's bounding rect
  (from a ref passed up from `JarvisPanel`; the "J" shortcut uses the same
  ref, so shifted positions are respected).
- **Open:** the workspace container animates a `clip-path: circle()` from a
  radius equal to the button, centered on the button, to a radius covering
  the workspace (~450 ms, ease-out). The launcher's `Orb` and the workspace
  header's orb share a framer-motion `layoutId`, so the orb visibly travels
  from the button to the header. Chat content (`JarvisSessionList`,
  `JarvisChat`) fades in over the last third of the reveal.
- On desktop the canvas region's shrink into its right strip animates with
  the same duration/easing (width/left transition on the existing wrapper).
- **Close** (× or Esc): exact reverse — content fades, clip-path circle
  shrinks back into the button, orb returns; the launcher is shown again
  once the animation completes (`AnimatePresence` exit).
- Reduced motion: plain crossfade.
- `JarvisWorkspace`'s internal logic (sessions, messages, Esc handling
  order) is unchanged; it gains an orb in its header if it lacks one.

## Error handling

- `saveThreadPosition` failure: swallowed, as with task positions today.
- `localStorage` unavailable/throws: open-thread state starts empty and is
  not persisted.
- Catch-up errors: unchanged existing handling (error message in modal).
- Missing launcher rect (e.g. button unmounted): Jarvis opens with a
  centered circle reveal from the viewport's bottom-right.

## Testing

- **Unit (vitest):** `clusterLayout` — no pairwise overlaps, priority
  ordering on inner rings, DONE on outer ring, radius bounds all bubbles,
  add-slot presence by permission; `threadLayout` — deterministic,
  non-overlapping defaults; dashboard count/label derivation.
- **Component:** `ThreadClusterNode` — renders collapsed dashboard, opens
  and closes (× present / absent), task click calls the open-task handler,
  menu items gated by permissions; `TaskBubble` — DONE and IN_PROGRESS
  styling, `!` marks; `Canvas.test.tsx` updated to drop tier assertions;
  `JarvisLauncherTransition` — opens/closes, renders workspace on open.
  Component tests mock framer-motion timing where needed.
- **Browser verification:** run the dev server and check in the preview at
  desktop and phone sizes: open/close animation (including interrupting
  mid-animation), zoom smoothness, thread drag + reload persistence, Jarvis
  open/close transition.
- **E2E (Playwright):** `catchup-flow.spec.ts` (and any other spec that
  zooms across the old tier threshold or targets `TaskNode` cards) is
  updated to open threads by clicking bubbles instead. E2E specs don't
  reset the DB but do create data against the configured `DATABASE_URL`,
  so they're only run with the user's go-ahead.
- **Integration tests are NOT run.** They reset the live Supabase database
  via `DATABASE_URL`. A `saveThreadPosition` integration test is written
  alongside the existing ones but only run once a separate test database
  exists. The migration is additive only; the DB is never reset.

## Out of scope

- Physics-based cluster collision/avoidance between threads.
- Showing secondary-thread links visually in clusters.
- Changes to `TaskListView`, `TaskDetailPanel`, or Jarvis chat internals.
- Removing the `TaskPosition` model or `saveTaskPosition` action.
