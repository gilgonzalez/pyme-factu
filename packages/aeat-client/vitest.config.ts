import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "aeat-client",
    include: ["test/**/*.test.ts"],
  },
});
