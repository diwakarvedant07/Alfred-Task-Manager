import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // DATABASE_URL points at a remote Supabase Postgres rather than local
  // Docker, so every auth/DB round trip (signup, credential lookup, the
  // canvas page's own queries) carries real network latency on top of
  // Playwright's default 5s assertion timeout — raise it so a slow-but-
  // correct flow doesn't read as a failure.
  expect: { timeout: 15000 },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3089",
    reuseExistingServer: true,
    timeout: 60000,
  },
  use: { baseURL: "http://localhost:3089" },
});
