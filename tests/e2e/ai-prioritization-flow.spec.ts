import { test, expect } from "@playwright/test";

// End-to-end test for AI-assisted task prioritization: creating a task
// fires a real, fire-and-forget suggestTaskPriority() call to the real
// Gemini API (see components/canvas/Canvas.tsx handleCreateTask); once it
// resolves, the task's priority/priorityIsAiSuggested fields update via the
// same taskEditOverrides state used for in-progress edits, and an "AI
// suggested" badge appears next to the priority both on the canvas card and
// in the task detail panel. Manually changing priority clears
// priorityIsAiSuggested (see app/actions/tasks.ts updateTask), so the badge
// must disappear immediately in both places.
//
// This deliberately never asserts *which* priority the AI chose -- that's
// non-deterministic model output. It only asserts the observable,
// model-independent behavior: a badge appears, and a manual override makes
// it disappear.
//
// Selectors were taken from the actual current source of the pages and
// components involved (not the plan's original draft), specifically:
//   - app/(auth)/signup/page.tsx
//   - components/canvas/Canvas.tsx, NewThreadButton.tsx, NewTaskButton.tsx,
//     TaskNode.tsx
//   - components/task-detail/TaskDetailPanel.tsx
//
// Real-UI detail the plan's draft missed: components/canvas/Canvas.tsx
// renders the TaskDetailPanel as an overlay *alongside* the ReactFlow
// canvas, not in place of it -- so once the panel is open, there are two
// elements with aria-label="AI suggested" on the page at once (the
// TaskNode's badge underneath, plus the panel's own). Asserting
// page.getByLabel("AI suggested") directly at that point (as the draft
// does) hits a Playwright strict-mode violation from the duplicate match.
// This test scopes that assertion to the open dialog via
// page.getByRole("dialog", { name: "Task detail" }) to disambiguate, and
// only asserts the unscoped, page-wide locator when checking for absence
// (toHaveCount(0) doesn't require a single match).
//
// A second real-world gap found while running this test: both of
// ModelPicker's preset models ("gemini-2.5-pro" and "gemini-2.5-flash",
// components/settings/ModelPicker.tsx) are now rejected by the real Gemini
// API with a 404 "no longer available" error -- confirmed directly against
// the API with this environment's GEMINI_API_KEY, independent of this test
// or of suggestTaskPriority's own logic. That's a model-catalog staleness
// issue upstream of this sub-project's code, not a bug in suggestTaskPriority
// or in the test. Since the test must not assert which priority the AI
// picks anyway, it sidesteps the dead presets using ModelPicker's existing
// "Custom…" model-id input (already shipped, no app code changed here) to
// point the AI call at "gemini-flash-latest", a currently-live model.
//
// Retries are scoped to just this file (not playwright.config.ts, which
// would affect every other e2e test too) because this is the one test that
// depends on a live third-party call: Gemini's own API has been observed
// during development to intermittently return a transient 503 ("This model
// is currently experiencing high demand..."), which no client-side timeout
// can wait out since generateText's promise rejects immediately rather than
// hanging. A whole-test retry re-runs the real signup-through-suggestion
// flow with a fresh user, which is the correct way to absorb that kind of
// upstream flakiness without weakening what's actually asserted.
test.describe.configure({ retries: 2 });

test("AI priority suggestion appears after task creation and disappears on manual override", async ({
  page,
}) => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `aipriority-${runId}@example.com`;
  const taskTitle = "Fix a critical login bug affecting all mobile users";
  const taskDetailDialog = page.getByRole("dialog", { name: "Task detail" });

  await test.step("sign up and land on the canvas", async () => {
    await page.goto("/signup");
    await page.getByPlaceholder("Name").fill("Priority Tester");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill("correcthorse123");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/canvas/);
  });

  await test.step("create a thread", async () => {
    await page.getByRole("button", { name: "New thread" }).click();
    await page.getByLabel("Thread name").fill("Q3 Report");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText("Q3 Report")).toBeVisible();
  });

  await test.step("point the AI model at a currently-live Gemini model", async () => {
    // See the header comment: both preset models are dead upstream (404 "no
    // longer available"). Use the picker's existing Custom… input rather
    // than either preset so the real API call in the next step can succeed.
    await page.getByLabel("AI model").selectOption("custom");
    await page.getByLabel("Custom model ID").fill("gemini-flash-latest");
  });

  await test.step("create a task with an urgent title and description", async () => {
    // NewTaskButton is rendered per-thread; with only one thread on the
    // canvas "New task" is unambiguous.
    await page.getByRole("button", { name: "New task" }).click();
    await page.getByLabel("Title").fill(taskTitle);
    await page
      .getByLabel("Description")
      .fill("Users cannot sign in on iOS or Android as of this morning.");
    await page.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByText(taskTitle)).toBeVisible();
  });

  await test.step("the real AI suggestion lands and the badge appears on the canvas card", async () => {
    // Fire-and-forget: the task is created instantly at the default MEDIUM
    // priority, then suggestTaskPriority() resolves in the background via a
    // real Gemini call. Generous timeout for real network + model latency
    // (well beyond playwright.config.ts's already-raised 15s default).
    await expect(page.getByLabel("AI suggested")).toBeVisible({ timeout: 30000 });
  });

  await test.step("the badge also shows in the task detail panel", async () => {
    await page.getByText(taskTitle).click();
    await expect(taskDetailDialog).toBeVisible();
    await expect(taskDetailDialog.getByLabel("AI suggested")).toBeVisible();
  });

  await test.step("manually changing priority clears the AI-suggested badge everywhere", async () => {
    await taskDetailDialog.getByLabel("Priority").selectOption("LOW");
    await expect(taskDetailDialog.getByLabel("Priority")).toHaveValue("LOW");
    // Checked page-wide (not scoped to the dialog) so this also confirms
    // the canvas card's own badge -- still rendered underneath the open
    // panel -- disappeared too, since both read the same taskEditOverrides
    // entry for this task id.
    await expect(page.getByLabel("AI suggested")).toHaveCount(0);
  });
});
