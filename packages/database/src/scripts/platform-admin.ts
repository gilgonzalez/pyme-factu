// pnpm --filter @facturalibre/database admin:grant <email> [--revoke]
// Da (o quita) a una cuenta YA REGISTRADA y con el email verificado el papel de administrador de la plataforma.
// Usa DATABASE_URL (rol propietario): ningún rol de ejecución puede tocar platform_admins. Así ningún email de
// administrador vive en el código ni en una variable de la aplicación.
import "../load-env";
import pg from "pg";
import { requireEnv } from "../env";

const [email, flag] = process.argv.slice(2);
if (email === undefined || !email.includes("@")) {
  console.error("Uso: admin:grant <email> [--revoke]");
  process.exit(1);
}
const revoke = flag === "--revoke";

const client = new pg.Client({ connectionString: requireEnv("DATABASE_URL") });
await client.connect();
try {
  const found = await client.query<{ id: string; email_verified: boolean; deactivated_at: Date | null; suspended_at: Date | null }>(
    "SELECT id, email_verified, deactivated_at, suspended_at FROM users WHERE email = lower($1)",
    [email],
  );
  const user = found.rows[0];
  if (user === undefined) {
    console.error(`No hay ninguna cuenta con el email ${email}. Regístrate primero en la aplicación.`);
    process.exitCode = 1;
  } else if (revoke) {
    await client.query("DELETE FROM platform_admins WHERE user_id = $1", [user.id]);
    await client.query("INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, outcome) VALUES (NULL, 'platform.admin_revoked', 'user', $1, 'SUCCESS')", [user.id]);
    console.log(`${email} ya no es administrador de la plataforma.`);
  } else if (!user.email_verified || user.deactivated_at !== null || user.suspended_at !== null) {
    console.error(`La cuenta ${email} tiene que tener el email verificado y no estar desactivada ni suspendida.`);
    process.exitCode = 1;
  } else {
    await client.query("INSERT INTO platform_admins (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [user.id]);
    await client.query("INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, outcome) VALUES (NULL, 'platform.admin_granted', 'user', $1, 'SUCCESS')", [user.id]);
    console.log(`${email} es administrador de la plataforma.`);
  }
} finally {
  await client.end();
}
