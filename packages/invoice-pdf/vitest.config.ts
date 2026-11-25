import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "invoice-pdf",
    include: ["test/**/*.test.ts"],
  },
});
