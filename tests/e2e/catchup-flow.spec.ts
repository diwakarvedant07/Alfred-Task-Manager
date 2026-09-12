import { test, expect, type Page, type Locator } from "@playwright/test";

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
// Real-UI detail the plan's draft missed: a thread's bubble (and the "⋮"
// menu that has "View catch-up" on it) only renders once the canvas is
// zoomed out below the BUBBLE/CARD tier threshold (components/canvas/
// zoomTier.ts, ZOOM_TIER_THRESHOLD = 0.6) -- the canvas always starts in
// the CARD tier (app/canvas/page.tsx never passes initialTier). The
// draft's `page.getByText("Q3 Report").click()` actually hits a plain,
// handler-less <span> in the top-left thread list (rendered regardless of
// tier), which would pass trivially without ever exercising
// handleThreadBubbleClick or the bubble's menu at all. This test instead
// drives the ReactFlow Controls' real zoom buttons to reach each tier, and
// scopes locators to `.react-flow__node-threadBubble` / `-task` to
// disambiguate from that same-named strip text.

// Clicks the ReactFlow Controls' zoom button enough times to hit the
// canvas's min/max zoom bound, which flips the BUBBLE/CARD tier (see
// zoomTier.ts). Each click is a discrete, immediate zoomIn()/zoomOut()
// call (unlike a wheel gesture, whose "moveEnd" -- and so the app's own
// onMoveEnd-driven tier state -- never reliably fired for a
// Playwright-synthesized wheel event in this app, even though it did
// visibly change the canvas's raw CSS zoom transform), so a plain click
// loop is reliable here. Stops early once the button disables itself at
// the bound, instead of retrying a click Playwright would otherwise wait
// on indefinitely, and leaves the final assertion to fail with a clear
// message if the tier still didn't flip.
async function setZoomTier(page: Page, tier: "BUBBLE" | "CARD", target: Locator) {
  const button = page.getByRole("button", { name: tier === "BUBBLE" ? "Zoom Out" : "Zoom In" });
  for (let i = 0; i < 20; i++) {
    if (!(await button.isEnabled())) break;
    await button.click();
  }
  await expect(target).toBeVisible();
}

test("thread catch-up: no modal on first-ever view, manual View catch-up works, AI model preference persists", async ({
  page,
}) => {
  const email = `catchup-${Date.now()}@example.com`;
  const threadBubble = page.locator(".react-flow__node-threadBubble");
  const taskCard = page.locator(".react-flow__node-task");
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
    await expect(page.getByText("Q3 Report")).toBeVisible();
  });

  await test.step("first-ever view of the brand-new thread shows no catch-up modal", async () => {
    // Thread bubbles only render in the BUBBLE zoom tier -- zoom out to
    // reach it, then click the bubble itself (not the settings-strip text)
    // to actually trigger handleThreadBubbleClick.
    await setZoomTier(page, "BUBBLE", threadBubble);
    await threadBubble.getByText("Q3 Report").click();
    await expect(catchUpDialog).toHaveCount(0);
  });

  await test.step("create a task in the thread", async () => {
    await page.getByRole("button", { name: "New task" }).click();
    await page.getByLabel("Title").fill("Draft exec summary");
    await page.getByRole("button", { name: "Create task" }).click();
    // Task cards only render in the CARD zoom tier -- zoom back in to
    // confirm it was actually created, not just that the dialog closed.
    await setZoomTier(page, "CARD", taskCard);
    await expect(taskCard.getByText("Draft exec summary")).toBeVisible();
  });

  await test.step('manual "View catch-up" shows the empty-state placeholder', async () => {
    // Zoom back out to the BUBBLE tier to reach the thread's own menu.
    await setZoomTier(page, "BUBBLE", threadBubble);
    await threadBubble.getByRole("button", { name: "More actions" }).click();
    await threadBubble.getByRole("menuitem", { name: "View catch-up" }).click();

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
    await expect(page.getByLabel("AI model")).toHaveValue("gemini-3.8-flash");
    await page.getByLabel("AI model").selectOption("gemini-3.1-pro-preview");
    await page.reload();
    await expect(page.getByLabel("AI model")).toHaveValue("gemini-3.1-pro-preview");
  });
});
