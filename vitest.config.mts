import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    setupFiles: ["./tests/setup.ts"],
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
