import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "database",
    include: ["test/**/*.test.ts"],
    globalSetup: ["./src/testing/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
