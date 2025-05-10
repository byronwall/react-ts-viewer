import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true, // Use Vitest's global APIs (describe, it, expect, etc.)
    environment: "node", // Or 'jsdom' if you need DOM APIs for other tests
    // reporters: ['verbose'], // Optional: for more detailed output
    include: ["src/**/*.test.{ts,tsx}"], // Pattern for test files
    // setupFiles: ['./src/test/setup.ts'], // Optional: for setup before tests run
    coverage: {
      provider: "v8", // or 'istanbul'
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
    },
  },
});
