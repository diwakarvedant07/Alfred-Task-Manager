import { test, expect } from "@playwright/test";

// End-to-end regression test for the core Foundation flow: signup, thread
// and task creation, commenting, sharing with permission enforcement,
// deletion, and recycle-bin restore.
//
// Selectors here were taken from the actual current source of the pages and
// components involved (not the original plan's draft), specifically:
//   - app/(auth)/signup/page.tsx, app/(auth)/login/page.tsx
//   - components/canvas/Canvas.tsx, NewThreadButton.tsx, NewTaskButton.tsx,
//     ShareThreadDialog.tsx, CardMenu.tsx, TaskNode.tsx
//   - components/task-detail/TaskDetailPanel.tsx
//   - app/recycle-bin/page.tsx

test("signup, thread/task creation, sharing, delete, and recycle-bin restore", async ({
  page,
  browser,
}) => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ownerEmail = `owner-${runId}@example.com`;
  const viewerEmail = `viewer-${runId}@example.com`;

  await test.step("owner signs up and lands on the canvas", async () => {
    await page.goto("/signup");
    await page.getByPlaceholder("Name").fill("Owner");
    await page.getByPlaceholder("Email").fill(ownerEmail);
    await page.getByPlaceholder("Password").fill("correcthorse123");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/canvas/);
  });

  await test.step("owner creates a thread", async () => {
    await page.getByRole("button", { name: "New thread" }).click();
    await page.getByLabel("Thread name").fill("Q3 Report");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("button", { name: /^Q3 Report — .*Open thread$/ })).toBeVisible();
  });

  await test.step("owner creates a task in the thread", async () => {
    // NewTaskButton is rendered per-thread; with only one thread on the
    // canvas "New task" is unambiguous.
    await page.getByRole("button", { name: "New task" }).click();
    await page.getByLabel("Title").fill("Draft exec summary");
    await page.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByText("Draft exec summary")).toBeVisible();
  });

  await test.step("owner opens the task and posts a comment", async () => {
    await page.getByText("Draft exec summary").click();
    await expect(page.getByRole("dialog", { name: "Task detail" })).toBeVisible();
    await page.getByLabel("Add an update").fill("Pulled the Q3 numbers.");
    await page.getByText("Post update").click();
    await expect(page.getByText("Pulled the Q3 numbers.")).toBeVisible();
    await page.getByLabel("Close").click();
    await expect(page.getByRole("dialog", { name: "Task detail" })).not.toBeVisible();
  });

  const viewerContext = await browser.newContext();
  const viewerPage = await viewerContext.newPage();

  await test.step("a second user signs up (future Viewer)", async () => {
    await viewerPage.goto("/signup");
    await viewerPage.getByPlaceholder("Name").fill("Viewer");
    await viewerPage.getByPlaceholder("Email").fill(viewerEmail);
    await viewerPage.getByPlaceholder("Password").fill("correcthorse123");
    await viewerPage.getByRole("button", { name: "Sign up" }).click();
    await expect(viewerPage).toHaveURL(/\/canvas/);
  });

  await test.step("owner shares the thread with the second user as Viewer", async () => {
    // ShareThreadDialog is rendered per-thread, right next to "New task";
    // its confirm button is labelled "Share thread" to disambiguate from
    // the "Share" trigger that opens the dialog. There's no share-list UI
    // on the canvas to confirm against here — sharing is verified below by
    // the recipient actually seeing the thread on their own canvas.
    await page.getByRole("button", { name: "Share" }).click();
    await page.getByLabel("Email").fill(viewerEmail);
    await page.getByLabel("Permission").selectOption("VIEWER");
    await page.getByRole("button", { name: "Share thread" }).click();
    // The dialog's confirm button awaits the share server action before
    // closing, so waiting for it to disappear (and the "Share" trigger to
    // reappear) is how the test knows the share actually completed server-
    // side, rather than racing the viewer's page load below against it.
    // exact:true matters here — getByRole's name match is substring by
    // default, so "Share" would otherwise still match the "Share thread"
    // button while the dialog is mid-close, defeating the wait.
    await expect(page.getByRole("button", { name: "Share", exact: true })).toBeVisible();
  });

  await test.step("viewer sees the shared thread and task, and can comment", async () => {
    await viewerPage.goto("/canvas");
    // A fresh viewer's canvas starts with every thread closed.
    await viewerPage.getByRole("button", { name: /^Q3 Report — .*Open thread$/ }).click();
    await expect(viewerPage.getByText("Draft exec summary")).toBeVisible();

    await viewerPage.getByText("Draft exec summary").click();
    const viewerDialog = viewerPage.getByRole("dialog", { name: "Task detail" });
    await expect(viewerDialog).toBeVisible();

    // The owner's earlier comment is visible to the viewer too.
    await expect(viewerPage.getByText("Pulled the Q3 numbers.")).toBeVisible();

    await viewerPage.getByLabel("Add an update").fill("Looks good from my side.");
    await viewerPage.getByText("Post update").click();
    await expect(viewerPage.getByText("Looks good from my side.")).toBeVisible();

    await viewerPage.getByLabel("Close").click();
  });

  await test.step("viewer cannot edit the task's fields", async () => {
    await viewerPage.getByText("Draft exec summary").click();
    await expect(viewerPage.getByRole("dialog", { name: "Task detail" })).toBeVisible();

    await expect(
      viewerPage.getByText("You have view-only access to this thread.")
    ).toBeVisible();
    await expect(viewerPage.getByLabel("Title")).toBeDisabled();
    await expect(viewerPage.getByLabel("Description")).toBeDisabled();
    await expect(viewerPage.getByLabel("Work status")).toBeDisabled();
    await expect(viewerPage.getByLabel("Priority")).toBeDisabled();

    await viewerPage.getByLabel("Close").click();
  });

  await viewerContext.close();

  await test.step("owner sees the viewer's comment, then deletes the task", async () => {
    await page.reload();
    await page.getByText("Draft exec summary").click();
    await expect(page.getByText("Looks good from my side.")).toBeVisible();
    await page.getByLabel("Close").click();

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.getByText("Draft exec summary")).not.toBeVisible();
  });

  await test.step("the deleted task appears in the recycle bin with the 30-day note", async () => {
    await page.goto("/recycle-bin");
    await expect(page.getByText("Draft exec summary (task)")).toBeVisible();
    await expect(page.getByText(/permanently deleted 30 days/)).toBeVisible();
    await page.getByRole("button", { name: "Restore" }).click();
  });

  await test.step("the restored task is back on the canvas", async () => {
    await page.goto("/canvas");
    await expect(page.getByText("Draft exec summary")).toBeVisible();
  });
});
