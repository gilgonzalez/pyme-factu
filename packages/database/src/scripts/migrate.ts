// pnpm db:migrate — crea/actualiza los roles de ejecución y aplica las migraciones pendientes.
// Usa DATABASE_URL (rol administrador/propietario). Las contraseñas de los roles vienen del entorno.
import "dotenv/config";
import { ensureDatabaseRoles } from "../bootstrap";
import { requireEnv } from "../env";
import { deployMigrations } from "../migrations";

const adminUrl = requireEnv("DATABASE_URL");
await ensureDatabaseRoles(adminUrl, {
  app: requireEnv("APP_DB_PASSWORD"),
  auth: requireEnv("AUTH_DB_PASSWORD"),
  worker: requireEnv("WORKER_DB_PASSWORD"),
});
console.log("Roles de base de datos verificados.");
deployMigrations(adminUrl);
console.log("Migraciones aplicadas.");
