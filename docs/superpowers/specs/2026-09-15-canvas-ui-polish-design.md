# Canvas Board & Jarvis UI Polish — Design

## Context

The previous sub-project (Auth UX + App Shell) explicitly deferred
restyling the crude components living inside the canvas board itself,
since that surface was large enough to be its own follow-up pass once a
UI kit existed to build on. That kit now exists
(`components/ui/{Button,Input,FormAlert,Dropdown}.tsx`). This sub-project
spends it: `NewThreadButton`, `NewTaskButton`, `ShareThreadDialog`,
`CardMenu`, `CatchUpModal`, and `TaskDetailPanel` all currently render as
bare `<div role="dialog">` wrappers around unstyled native `<input>`/
`<select>`/`<textarea>`/`<button>` elements, with no positioning,
backdrop, or visual treatment at all — they just appear inline wherever
they're mounted in the DOM. `JarvisPanel` is a floating chat widget with
the same problem: plain text, no message-bubble styling, a literal `◈`
character in place of an icon.

None of these components need new interaction capabilities — every one
already does the right thing functionally (validation, permission
gating, long-press support, etc.). This is purely a visual/structural
polish pass, reusing and extending the existing UI kit.

## Approach

### New UI primitives (`components/ui/`)

- **`Modal.tsx`**: a dimmed backdrop (`fixed inset-0`, semi-transparent
  black) behind a centered card, closing on backdrop click or `Escape` —
  the same dismiss convention `Dropdown.tsx` already established (click
  outside / `Escape`), applied to a full-screen-backdrop + centered-card
  layout instead of an anchored popover. Takes `onClose` and `children`;
  the card itself (padding, border, rounded corners, shadow) is part of
  `Modal`, so consumers just supply their form content and don't
  re-implement the card chrome each time.
- **`Select.tsx`**: a styled wrapper around a native `<select>`, visually
  matching `Input.tsx` (same border/background/focus-ring treatment, same
  `label`/`hideLabel` API). Native `<select>` stays the underlying
  element — no custom listbox/combobox — so behavior (keyboard nav,
  screen readers, mobile) is exactly what it already is today, just
  restyled.
- **`Textarea.tsx`**: a styled multi-line counterpart to `Input.tsx`,
  same visual language, no icon slot (not needed by any current
  consumer).

All three follow the established convention: every `var()` reference
carries a DARK-mode fallback matching `lib/theme.ts`'s DARK output, and
every existing `aria-label`/`role`/accessible name in every component
touched below is preserved exactly, so none of the six components'
existing test files (`NewThreadButton.test.tsx`, `NewTaskButton.test.tsx`,
`ShareThreadDialog.test.tsx`, `CardMenu.test.tsx`,
`CatchUpModal.test.tsx`, `TaskDetailPanel.test.tsx`) need their
assertions changed — only new styling-related test additions, if any,
get appended.

### Quick-create forms → `Modal`

`NewThreadButton.tsx`, `NewTaskButton.tsx`, and `ShareThreadDialog.tsx`
are rebuilt on `Modal` + `Input`/`Select`/`Button`, replacing their
current bare inline `<div role="dialog">`. `ShareThreadDialog`'s existing
share list (name/email/permission/revoke) becomes a simple styled list
inside the same modal rather than a new component. `NewThreadButton`'s
category-color `<input type="color">` stays a native color input (still
the simplest correct tool for picking an arbitrary color) but gets a
visible swatch preview next to it instead of being the only visual cue.

### `CardMenu` — visual polish only

`CardMenu.tsx` keeps its own long-press-to-open interaction (`Dropdown`
doesn't support long-press, and rebuilding that isn't in scope) and its
`role="menu"`/`menuitem` semantics (correct here, unlike `Dropdown`,
since this genuinely is an actions-only list). Only the visual layer
changes: the popup gets the same panel styling (border, shadow, rounded
corners, dark background) already established elsewhere, and the trigger
switches from the literal `⋮` character to lucide's `MoreVertical` icon.

### `CatchUpModal` — visual polish only

Stays a full-screen takeover — it's a deliberately bigger, different
moment than a quick-create form (a "welcome back" summary), not another
instance of the new `Modal` pattern. Restyled: proper typography and
spacing for the summary text, `Button` for "Got it", lucide's `X` for
close instead of the literal `×` character.

### `TaskDetailPanel` — visual polish only

Stays a right-side slide-in panel — `Canvas.tsx` already positions it
absolutely against the right edge; that container-level positioning
doesn't change. Internally rebuilt on `Input` (title), `Textarea`
(description, add-comment), `Select` (work status, priority), and
`Button` (post update), with lucide's `X` for close. The existing
AI-suggested-priority badge (🤖 emoji) is kept as-is — out of scope for
this pass.

### `JarvisPanel` — modernized chat widget, same position

Stays bottom-right and floating (confirmed with the user — familiar
Intercom/Crisp-style pattern, doesn't compete for canvas space).
Restyled as an actual chat widget: a rounded circular trigger button
(lucide icon instead of `◈ JARVIS` text) that expands into a panel with
distinct message-bubble styling per role (user vs. Jarvis), using
`Textarea` + `Button` for the composer instead of bare elements. The
existing tool-call chips (✓/✗ + summary) keep their current text-based
format — just restyled to sit visually inside the message bubble rather
than as bare trailing text.

### Icons

`lucide-react` (already a dependency) replaces every remaining
text-character icon: `⋮` → `MoreVertical`, `×` → `X`, `◈` → an
appropriate chat/assistant icon (e.g. `Sparkles` or `Bot`) for the Jarvis
trigger.

### Testing

Same approach as the auth/shell UI-kit work: every existing
`aria-label`/`role`/accessible name in all six touched components is
preserved exactly, so `tests/component/{NewThreadButton,NewTaskButton,
ShareThreadDialog,CardMenu,CatchUpModal,TaskDetailPanel}.test.tsx` all
keep passing unmodified. New component tests are added for `Modal.tsx`,
`Select.tsx`, and `Textarea.tsx` (mirroring `Dropdown.test.tsx`'s and
`Input.test.tsx`'s style), plus a full-suite and `next build` check at
the end, matching the previous sub-project's final-review discipline.
