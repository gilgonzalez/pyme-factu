import type { Database } from "./client";

/** Comprobación de disponibilidad de PostgreSQL. No devuelve detalles del error (pueden contener datos sensibles). */
export async function isDatabaseReachable(db: Database): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
