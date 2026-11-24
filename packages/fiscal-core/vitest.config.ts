import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "fiscal-core",
    include: ["test/**/*.test.ts"],
  },
});
