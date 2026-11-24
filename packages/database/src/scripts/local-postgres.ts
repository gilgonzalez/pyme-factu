// pnpm db:local — PostgreSQL 18 local SIN Docker (solo desarrollo). Datos persistentes en .data/postgres.
// Alternativa recomendada cuando Docker está disponible: `docker compose up postgres`.
import "dotenv/config";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { requireEnv } from "../env";

const dataDir = fileURLToPath(new URL("../../../../.data/postgres", import.meta.url));
const port = Number(process.env["LOCAL_PG_PORT"] ?? "5432");

const server = new EmbeddedPostgres({
  databaseDir: dataDir,
  port,
  user: "postgres",
  password: requireEnv("LOCAL_PG_PASSWORD"),
  persistent: true,
  // En Windows initdb usaría WIN1252 por defecto; la aplicación exige UTF-8.
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

if (!existsSync(dataDir)) {
  await server.initialise();
}
await server.start();
console.log(`PostgreSQL local escuchando en 127.0.0.1:${port} (datos en ${dataDir}). Ctrl+C para detener.`);

const shutdown = (): void => {
  void server.stop().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
