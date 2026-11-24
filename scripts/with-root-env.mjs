// Uso: node ../../scripts/with-root-env.mjs <script-node> [args...]
// Carga el .env de la raíz del monorepo (si existe) y ejecuta el script como proceso hijo, que hereda
// el entorno. Las variables ya definidas (Docker, CI) tienen prioridad: process.loadEnvFile no las sobrescribe.
// Necesario para Next.js 16, que no admite --env-file en NODE_OPTIONS de sus procesos hijos.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envFile = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const [script, ...args] = process.argv.slice(2);
if (script === undefined) {
  console.error("Uso: node scripts/with-root-env.mjs <script-node> [args...]");
  process.exit(2);
}
const child = spawn(process.execPath, [script, ...args], { stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
