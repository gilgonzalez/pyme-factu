import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "verifactu",
    include: ["test/**/*.test.ts"],
  },
});
