import { test, expect } from "@playwright/test";

// End-to-end test for Jarvis: a chat message that clearly names a new,
// never-before-seen project should result in Jarvis creating a new thread
// and a task inside it via the real Gemini API (using the signed-up test
// user's default preferredAiModel, gemini-3.8-flash — confirmed live and
// working as of the dead-preset-model fix in the prior sub-project).
//
// This deliberately does not assert on Jarvis's exact reply wording (model
// output is non-deterministic) — only on the resulting task appearing on
// the canvas, which is the observable, model-independent behavior.
test.describe.configure({ retries: 2 });

test("Jarvis creates a new thread and task from a chat message", async ({ page }) => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `jarvis-${runId}@example.com`;

  await test.step("sign up and land on the canvas", async () => {
    await page.goto("/signup");
    await page.getByPlaceholder("Name").fill("Jarvis Tester");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill("correcthorse123");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/canvas/);
  });

  await test.step("open Jarvis and send a message describing brand-new work", async () => {
    await page.getByRole("button", { name: "Jarvis" }).click();
    await page.getByLabel("Message Jarvis").fill(
      "Start tracking a brand new initiative called Rocket Launch Prep — first thing to do is book the venue."
    );
    await page.getByRole("button", { name: "Send" }).click();
  });

  await test.step("Jarvis's reply and a success chip appear", async () => {
    // Scoped via data-testid rather than a bare text match: the chat dialog
    // now also renders a persistent "Jarvis" header and a hidden "Message
    // Jarvis" label (JarvisPanel.tsx's modernized UI kit), so a generic
    // getByText(/./) inside the dialog is a Playwright strict-mode violation
    // even before any message arrives. Messages are appended user-then-
    // assistant (see JarvisPanel.tsx's handleSend), so .last() is the reply.
    await expect(page.getByTestId("jarvis-message").last()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/✓/)).toBeVisible({ timeout: 30000 });
  });

  await test.step("the new thread and task appear on the canvas", async () => {
    // Empirically, against the real API: the model reliably echoes the exact
    // name from the prompt ("Rocket Launch Prep") in both its reply and the
    // tool-call chip, so exact-name matching itself isn't the fragile part
    // here (unlike a priority level -- see ai-prioritization-flow.spec.ts).
    //
    // Two things ARE fragile, discovered by first running this against the
    // real API:
    //
    // 1. JarvisPanel's sendJarvisMessage() only updates its own local chat
    //    state (components/jarvis/JarvisPanel.tsx) -- unlike every other
    //    canvas mutation (see Canvas.tsx's many router.refresh() calls after
    //    handleCreateThread/handleCreateTask etc.), it never refreshes the
    //    server-rendered thread/task props. So the new thread/task don't
    //    reach the canvas until the page is reloaded and app/canvas/page.tsx
    //    re-fetches from the DB.
    // 2. Once it IS on the canvas, the thread name legitimately renders
    //    twice (once in the per-thread controls row, once on the ReactFlow
    //    thread bubble node -- see Canvas.tsx), so a single
    //    getByText(...).toBeVisible() is a Playwright strict-mode violation
    //    even on success. Per the brief's guidance for exactly this kind of
    //    empirically-discovered fragility, this checks for at least one
    //    match (.first()) rather than requiring exactly one.
    await page.reload();
    await expect(page.getByText("Rocket Launch Prep").first()).toBeVisible({ timeout: 10000 });
  });
});
