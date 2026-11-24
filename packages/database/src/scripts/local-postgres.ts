// pnpm db:local — PostgreSQL 18 local SIN Docker (solo desarrollo). Datos persistentes en .data/postgres.
// Usa las mismas variables POSTGRES_* que docker-compose.yml, así un único .env sirve para ambos modos.
// Alternativa recomendada cuando Docker está disponible: `docker compose up -d postgres`.
import "../load-env";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { requireEnv } from "../env";

const dataDir = fileURLToPath(new URL("../../../../.data/postgres", import.meta.url));
const port = Number(process.env["POSTGRES_PORT"] ?? "5432");
const database = requireEnv("POSTGRES_DB");

const server = new EmbeddedPostgres({
  databaseDir: dataDir,
  port,
  user: requireEnv("POSTGRES_USER"),
  password: requireEnv("POSTGRES_PASSWORD"),
  persistent: true,
  // En Windows initdb usaría WIN1252 por defecto; la aplicación exige UTF-8.
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

if (!existsSync(dataDir)) {
  await server.initialise();
}
await server.start();

const client = server.getPgClient("postgres", "127.0.0.1");
await client.connect();
const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
if (exists.rowCount === 0) {
  await client.query(`CREATE DATABASE ${client.escapeIdentifier(database)} ENCODING 'UTF8' TEMPLATE template0`);
}
await client.end();

console.log(`PostgreSQL local escuchando en 127.0.0.1:${port}, base "${database}" (datos en ${dataDir}). Ctrl+C para detener.`);

const shutdown = (): void => {
  void server.stop().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
