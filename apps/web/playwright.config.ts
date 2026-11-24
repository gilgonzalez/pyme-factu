import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env["E2E_PORT"] ?? "3100");
const baseURL = process.env["E2E_BASE_URL"] ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // Requiere `pnpm build` previo. Si E2E_BASE_URL apunta a un entorno ya levantado, no se arranca nada.
  ...(process.env["E2E_BASE_URL"]
    ? {}
    : {
        webServer: {
          command: "pnpm start",
          env: { PORT: String(port), HOSTNAME: "127.0.0.1" },
          url: `${baseURL}/`,
          reuseExistingServer: !process.env["CI"],
          timeout: 120_000,
        },
      }),
});
