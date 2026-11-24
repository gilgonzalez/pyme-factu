// Extrae el SQLSTATE de PostgreSQL de un error de Prisma. Con el adaptador pg, $queryRaw devuelve
// P2010 con el SQLSTATE en `meta.code`; otras consultas lo anidan en `cause`.
const SQLSTATE = /^[0-9A-Z]{5}$/;
const KEYS = ["originalCode", "code"] as const;
const NESTED = ["meta", "cause", "driverAdapterError"] as const;

function ownCode(value: Record<string, unknown>): string | null {
  for (const key of KEYS) {
    const candidate = value[key];
    if (typeof candidate === "string" && SQLSTATE.test(candidate)) return candidate;
  }
  return null;
}

/** SQLSTATE (p. ej. "23505") del error o de sus causas, o null si no procede de PostgreSQL. */
export function databaseErrorCode(error: unknown, depth = 0): string | null {
  if (typeof error !== "object" || error === null || depth > 4) return null;
  const record = error as Record<string, unknown>;
  // Primero lo anidado: el envoltorio de Prisma tiene su propio código de 5 caracteres (p. ej. P2010).
  for (const key of NESTED) {
    const nested = databaseErrorCode(record[key], depth + 1);
    if (nested !== null) return nested;
  }
  return ownCode(record);
}
