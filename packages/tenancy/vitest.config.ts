import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "tenancy",
    include: ["test/**/*.test.ts"],
    globalSetup: [fileURLToPath(import.meta.resolve("@facturalibre/database/testing/global-setup"))],
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
