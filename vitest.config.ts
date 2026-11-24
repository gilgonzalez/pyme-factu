import { withCrapTypescriptVitest } from "@barney-media/crap-typescript-vitest";

// ub-mode: "Reduce each function under CRAP 10".
export default withCrapTypescriptVitest(
  {
    test: {
      // Cada paquete define su proyecto (y su globalSetup de PostgreSQL si lo necesita).
      projects: ["packages/*", "apps/worker"],
      coverage: {
        provider: "v8",
        include: ["packages/*/src/**/*.ts", "apps/worker/src/**/*.ts"],
        exclude: ["**/generated/**", "**/testing/**", "**/scripts/**"],
      },
    },
  },
  { threshold: 10, agent: true },
);
