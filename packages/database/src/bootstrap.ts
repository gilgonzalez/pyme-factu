import pg from "pg";

/** Roles de login usados en tiempo de ejecución. Ninguno es propietario de tablas ni tiene BYPASSRLS. */
export const DB_ROLES = {
  app: "facturalibre_app",
  auth: "facturalibre_auth",
  worker: "facturalibre_worker",
} as const;

export type RuntimeRole = keyof typeof DB_ROLES;
export type RolePasswords = Readonly<Record<RuntimeRole, string>>;

const MIN_PASSWORD_LENGTH = 16;

/**
 * Crea (o actualiza) de forma idempotente los roles de ejecución. Debe ejecutarse con un rol
 * administrador ANTES de `prisma migrate deploy`, porque las migraciones conceden permisos a estos roles.
 */
export async function ensureDatabaseRoles(adminUrl: string, passwords: RolePasswords): Promise<void> {
  for (const [key, password] of Object.entries(passwords)) {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`La contraseña del rol ${key} debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
    }
  }
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    // Los roles son globales del servidor: se serializan las ejecuciones concurrentes (p. ej. varios
    // paquetes de pruebas contra el mismo servidor) para que no compitan al comprobar y crear cada rol.
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('facturalibre:ensure_database_roles'))");
    for (const key of Object.keys(DB_ROLES) as RuntimeRole[]) {
      const role = DB_ROLES[key];
      const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
      const verb = exists.rowCount === 0 ? "CREATE" : "ALTER";
      await client.query(
        `${verb} ROLE ${client.escapeIdentifier(role)} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD ${client.escapeLiteral(passwords[key])}`,
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

/** Construye la URL de conexión de un rol de ejecución a partir de la URL administradora. */
export function roleConnectionUrl(adminUrl: string, role: RuntimeRole, password: string): string {
  const url = new URL(adminUrl);
  url.username = DB_ROLES[role];
  url.password = encodeURIComponent(password);
  return url.toString();
}
