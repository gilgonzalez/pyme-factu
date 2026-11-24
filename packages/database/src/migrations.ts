import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));

/** Aplica las migraciones pendientes con `prisma migrate deploy` usando la URL administradora. */
export function deployMigrations(adminUrl: string): void {
  const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: adminUrl },
    stdio: ["ignore", "pipe", "pipe"],
  });
}
