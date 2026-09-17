import { test, expect } from "@playwright/test";

// End-to-end test for Jarvis: a chat message that clearly names a new,
// never-before-seen project should result in Jarvis creating a new thread
// and a task inside it via the real Gemini API (using the signed-up test
// user's default preferredAiModel, gemini-3.8-flash).
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

  await test.step("open the Jarvis workspace and send a message describing brand-new work", async () => {
    await page.getByRole("button", { name: "Jarvis" }).click();
    await page.getByLabel("Message Jarvis").fill(
      "Start tracking a brand new initiative called Rocket Launch Prep — first thing to do is book the venue."
    );
    await page.getByRole("button", { name: "Send" }).click();
  });

  await test.step("Jarvis's reply appears, and the new thread/task show up live on the canvas preview", async () => {
    // .last(): messages append user-then-assistant (see JarvisWorkspace's
    // handleSend), so this is the reply, not the just-sent user message.
    await expect(page.getByTestId("jarvis-message").last()).toBeVisible({ timeout: 30000 });
    // .first(): the model reliably names the tool-call target in both its
    // reply text and the chip -- a second success chip (if Jarvis makes more
    // than one tool call) would otherwise be a Playwright strict-mode
    // violation on a bare getByText(/✓/).
    await expect(page.getByText(/✓/).first()).toBeVisible({ timeout: 30000 });
    // No page.reload() needed: JarvisWorkspace's handleSend calls
    // router.refresh() after a successful send specifically so the canvas
    // preview reflects tool-call results live.
    await expect(page.getByText("Rocket Launch Prep").first()).toBeVisible({ timeout: 10000 });
  });

  await test.step("closing the workspace returns to the full canvas", async () => {
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("button", { name: "Jarvis" })).toBeVisible();
  });
});
