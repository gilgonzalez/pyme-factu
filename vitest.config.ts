import { withCrapTypescriptVitest } from "@barney-media/crap-typescript-vitest";

// ub-mode: "Reduce each function under CRAP 10".
export default withCrapTypescriptVitest(
  {
    test: {
      include: ["test/**/*.test.ts"],
      coverage: { provider: "v8", include: ["src/**/*.ts"] },
    },
  },
  { threshold: 10, agent: true },
);
