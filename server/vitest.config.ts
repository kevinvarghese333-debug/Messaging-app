import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: "./test/globalSetup.ts",
    env: {
      DATABASE_URL: "file:./test.db", // resolved relative to prisma/, isolated from dev.db
      JWT_SECRET: "test-secret",
    },
    fileParallelism: false, // both suites share one SQLite test database
    testTimeout: 20000,
  },
});
