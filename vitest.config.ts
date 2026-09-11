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
  },
  resolve: {
    alias: { "@": path.resolve(dirname, ".") },
  },
});
