import "server-only";
import { createDatabaseClient, requireEnv, type Database } from "@facturalibre/database";

// Una única instancia por proceso (también entre recargas en desarrollo).
const holder = globalThis as typeof globalThis & { facturalibreDb?: Database };

/**
 * Cliente con el rol facturalibre_app (sin BYPASSRLS). El acceso a datos de un tenant debe
 * hacerse SIEMPRE mediante runInTenant de @facturalibre/tenancy.
 */
export function getDatabase(): Database {
  holder.facturalibreDb ??= createDatabaseClient(requireEnv("APP_DATABASE_URL"));
  return holder.facturalibreDb;
}
