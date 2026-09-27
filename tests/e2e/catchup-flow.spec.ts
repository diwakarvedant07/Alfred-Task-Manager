import { test, expect } from "@playwright/test";

// End-to-end test for the thread catch-up flow: a brand-new thread's very
// first view shows no catch-up modal, the manual "View catch-up" menu item
// shows the empty-state placeholder before any real activity exists, and
// the AI model preference persists across a reload.
//
// This deliberately never exercises the staleness-triggered/real-Gemini
// path: a first-ever view is never "stale" (lib/threadStaleness.ts treats a
// null lastViewedAt as not-stale), and the manual "View catch-up" item
// (getStoredThreadSummary in app/actions/threadCatchUp.ts) only ever reads
// the stored ThreadSummary row -- it never calls generateText/Gemini. The
// 24h staleness math itself is already covered by Task 6's integration
// tests using an injected `now`.
//
// Selectors were taken from the actual current source of the pages and
// components involved (not the plan's original draft), specifically:
//   - app/(auth)/signup/page.tsx
//   - components/canvas/Canvas.tsx, ThreadBubbleNode.tsx, CardMenu.tsx,
//     NewThreadButton.tsx, NewTaskButton.tsx, CatchUpModal.tsx
//   - components/settings/ModelPicker.tsx
//
// Threads are bubbles that open on click (components/canvas/
// ThreadClusterNode.tsx); task bubbles only exist inside an open thread.
// The thread's name also appears in the threads panel, so the bubble is
// located by its aria-label (which ends in "Open thread").

test("thread catch-up: no modal on first-ever view, manual View catch-up works, AI model preference persists", async ({
  page,
}) => {
  const email = `catchup-${Date.now()}@example.com`;
  const threadNode = page.locator(".react-flow__node-threadCluster");
  const threadBubble = page.getByRole("button", { name: /^Q3 Report — .*Open thread$/ });
  const closeThread = page.getByRole("button", { name: "Close Q3 Report" });
  const catchUpDialog = page.getByRole("dialog", { name: "Catch-up" });

  await test.step("sign up and land on the canvas", async () => {
    await page.goto("/signup");
    await page.getByPlaceholder("Name").fill("Catchup Tester");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill("correcthorse123");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/canvas/);
  });

  await test.step("create a thread", async () => {
    await page.getByRole("button", { name: "New thread" }).click();
    await page.getByLabel("Thread name").fill("Q3 Report");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(threadBubble).toBeVisible();
  });

  await test.step("first-ever view of the brand-new thread shows no catch-up modal", async () => {
    // Opening the bubble runs handleThreadBubbleClick's catch-up check.
    await threadBubble.click();
    await expect(closeThread).toBeVisible();
    await expect(catchUpDialog).toHaveCount(0);
  });

  await test.step("create a task in the thread", async () => {
    await page.getByRole("button", { name: "New task" }).click();
    await page.getByLabel("Title").fill("Draft exec summary");
    await page.getByRole("button", { name: "Create task" }).click();
    // The thread is open, so the new task pops into its cluster.
    await expect(page.getByRole("button", { name: /^Draft exec summary, / })).toBeVisible();
  });

  await test.step('manual "View catch-up" shows the empty-state placeholder', async () => {
    // The ⋮ menu lives on the collapsed bubble, so close the thread first.
    await closeThread.click();
    await expect(threadBubble).toBeVisible();
    await threadNode.getByRole("button", { name: "More actions" }).click();
    await threadNode.getByRole("menuitem", { name: "View catch-up" }).click();

    await expect(catchUpDialog).toBeVisible();
    await expect(catchUpDialog.getByText("Nothing to catch up on yet.")).toBeVisible();

    // Viewing the stored (or, here, placeholder) summary must never itself
    // count as a fresh "view" that resets staleness -- that's covered by
    // getStoredThreadSummary never touching ThreadView at all (unlike
    // openThreadAndMaybeGetCatchUp, which upserts lastViewedAt). See
    // lib/threadStaleness.ts / app/actions/threadCatchUp.ts for that
    // invariant; there's no user-visible signal of it to assert on here.
    await catchUpDialog.getByRole("button", { name: "Got it" }).click();
    await expect(catchUpDialog).toHaveCount(0);
  });

  await test.step("changing the AI model preference persists across a reload", async () => {
    await page.getByRole("button", { name: "User menu" }).click();
    await expect(page.getByLabel("AI model")).toHaveValue("gemini-3.8-flash");
    await page.getByLabel("AI model").selectOption("gemini-3.1-pro-preview");
    await page.reload();
    await page.getByRole("button", { name: "User menu" }).click();
    await expect(page.getByLabel("AI model")).toHaveValue("gemini-3.1-pro-preview");
  });
});
