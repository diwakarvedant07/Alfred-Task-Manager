// tests/e2e/forgot-password-flow.spec.ts
import { test, expect } from "@playwright/test";

test("forgot password: request a reset link, use it, then log in with the new password", async ({ page }) => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `forgot-${runId}@example.com`;

  await test.step("sign up", async () => {
    await page.goto("/signup");
    await page.getByPlaceholder("Name").fill("Forgetful");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill("correcthorse123");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/canvas/);
  });

  await test.step("log out via the navbar's user menu", async () => {
    await page.getByRole("button", { name: "User menu" }).click();
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  let resetPath = "";
  await test.step("request a password reset link", async () => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();

    const link = page.getByRole("link", { name: /\/reset-password\?token=/ });
    await expect(link).toBeVisible();
    resetPath = (await link.getAttribute("href"))!;
  });

  await test.step("reset the password", async () => {
    await page.goto(resetPath);
    await page.getByLabel("New password", { exact: true }).fill("brandnewpassword123");
    await page.getByLabel("Confirm new password").fill("brandnewpassword123");
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByText("Password updated")).toBeVisible();
  });

  await test.step("log in with the new password", async () => {
    await page.getByRole("link", { name: "Go to log in" }).click();
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill("brandnewpassword123");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/canvas/);
  });
});
