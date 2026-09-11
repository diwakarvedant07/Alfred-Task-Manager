import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

const dirname = import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setupTests.ts"],
    globals: true,
    // Integration tests share one Postgres instance and each resets it via
    // resetDb() in beforeEach. Running test files in parallel workers lets
    // one file's reset race another file's writes, causing intermittent FK
    // failures. Running files sequentially keeps the shared DB deterministic.
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(dirname, ".") },
  },
});
