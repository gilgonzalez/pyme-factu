// Administración de la plataforma (superadmin) a nivel de PostgreSQL: quién es administrador, panel con
// metadatos, suspensiones auditadas y soporte de SOLO LECTURA garantizado por la base de datos. Datos propios
// (no los fixtures compartidos), ficticios.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { testClients } from "../src/testing";

const urls = inject("dbUrls");
const clients = testClients();

const ADMIN = "01900000-0000-7000-8000-0000000ad001";
const MEMBER = "01900000-0000-7000-8000-0000000ad002";
const TENANT = "01900000-0000-7000-8000-0000000ad0aa";
const TAXPAYER = "01900000-0000-7000-8000-0000000ad0a1";

let app: pg.Client;
let owner: pg.Client;

/** Transacción con contexto de seguridad, revertida SIEMPRE. `readOnly` abre una transacción de solo lectura. */
async function as<T>(user: string, work: () => Promise<T>, options: { tenant?: string; support?: boolean; readOnly?: boolean } = {}): Promise<T> {
  await app.query(options.readOnly === true ? "BEGIN READ ONLY" : "BEGIN");
  try {
    await app.query("SELECT set_config('app.user_id', $1, true), set_config('app.tenant_id', $2, true), set_config('app.support', $3, true)", [
      user,
      options.tenant ?? "",
      options.support === true ? "on" : "",
    ]);
    return await work();
  } finally {
    await app.query("ROLLBACK");
  }
}

beforeAll(async () => {
  app = await clients.connect(urls.app);
  owner = await clients.connect(urls.owner);
  await owner.query(
    `INSERT INTO users (id, name, email, email_verified, updated_at) VALUES
      ($1, 'Admin Ficticio', 'admin-plataforma@example.test', true, now()), ($2, 'Socia Ficticia', 'socia-plataforma@example.test', true, now())`,
    [ADMIN, MEMBER],
  );
  await owner.query(`INSERT INTO tenants (id, slug, name, updated_at) VALUES ($1, 'plataforma-ficticia', 'Plataforma Ficticia SL', now())`, [TENANT]);
  await owner.query(`INSERT INTO tenant_memberships (tenant_id, user_id, role, taxpayer_scope, status, updated_at) VALUES ($1, $2, 'OWNER', 'ALL_TAXPAYERS', 'ACTIVE', now())`, [
    TENANT,
    MEMBER,
  ]);
  await owner.query(`INSERT INTO taxpayers (id, tenant_id, person_type, nif, legal_name, updated_at) VALUES ($1, $2, 'LEGAL_ENTITY', 'B00000009', 'Plataforma Uno SL', now())`, [
    TAXPAYER,
    TENANT,
  ]);
  await owner.query(`INSERT INTO platform_admins (user_id) VALUES ($1)`, [ADMIN]);
});
afterAll(async () => {
  await clients.closeAll();
});

describe("quién administra la plataforma", () => {
  it("solo el rol propietario gestiona la tabla de administradores", async () => {
    await expect(as(MEMBER, () => app.query("SELECT * FROM platform_admins"))).rejects.toThrow(/permission denied/);
    await expect(as(MEMBER, () => app.query("INSERT INTO platform_admins (user_id) VALUES ($1)", [MEMBER]))).rejects.toThrow(/permission denied/);
  });

  it("is_platform_admin distingue al administrador; un administrador suspendido deja de serlo", async () => {
    const check = (user: string) => as(user, async () => (await app.query<{ admin: boolean }>("SELECT app.is_platform_admin() AS admin")).rows[0]?.admin);
    expect(await check(ADMIN)).toBe(true);
    expect(await check(MEMBER)).toBe(false);
    await owner.query("UPDATE users SET suspended_at = now() WHERE id = $1", [ADMIN]);
    expect(await check(ADMIN)).toBe(false);
    await owner.query("UPDATE users SET suspended_at = NULL WHERE id = $1", [ADMIN]);
  });
});

describe("panel de la plataforma", () => {
  it("quien no es administrador no puede consultarlo", async () => {
    for (const query of ["SELECT app.admin_overview()", "SELECT * FROM app.admin_tenants()", "SELECT * FROM app.admin_users()", "SELECT * FROM app.admin_verifactu()"]) {
      await expect(as(MEMBER, () => app.query(query))).rejects.toThrow(/PLATFORM_ADMIN_REQUIRED/);
    }
  });

  it("el administrador ve organizaciones y usuarios con sus recuentos", async () => {
    const tenants = await as(ADMIN, () => app.query("SELECT * FROM app.admin_tenants() WHERE id = $1", [TENANT]));
    expect(tenants.rows[0]).toMatchObject({ name: "Plataforma Ficticia SL", slug: "plataforma-ficticia", members: "1", taxpayers: "1", issued_invoices: "0" });
    const users = await as(ADMIN, () => app.query("SELECT * FROM app.admin_users() WHERE id IN ($1, $2) ORDER BY email", [ADMIN, MEMBER]));
    expect(users.rows.map((row: { email: string; is_admin: boolean; organizations: string }) => [row.email, row.is_admin, row.organizations])).toEqual([
      ["admin-plataforma@example.test", true, "0"],
      ["socia-plataforma@example.test", false, "1"],
    ]);
    const overview = await as(ADMIN, () => app.query<{ o: Record<string, number> }>("SELECT app.admin_overview() AS o"));
    expect(overview.rows[0]?.o.tenants).toBeGreaterThanOrEqual(1);
    await expect(as(ADMIN, () => app.query("SELECT * FROM app.admin_verifactu()"))).resolves.toBeDefined();
  });
});

describe("soporte de solo lectura", () => {
  const taxpayersSeen = (user: string, options: { support?: boolean; readOnly?: boolean }) =>
    as(user, async () => (await app.query<{ id: string }>("SELECT id FROM taxpayers WHERE tenant_id = $1", [TENANT])).rows.length, { tenant: TENANT, ...options });

  it("el administrador ve la organización SOLO en una transacción de lectura y con el soporte activado", async () => {
    expect(await taxpayersSeen(ADMIN, {})).toBe(0);
    expect(await taxpayersSeen(ADMIN, { support: true })).toBe(0);
    expect(await taxpayersSeen(ADMIN, { support: true, readOnly: true })).toBe(1);
  });

  it("quien no es administrador no gana nada activando el soporte", async () => {
    const outsider = "01900000-0000-7000-8000-0000000ad003";
    await owner.query(`INSERT INTO users (id, name, email, updated_at) VALUES ($1, 'Ajeno Ficticio', 'ajeno-plataforma@example.test', now())`, [outsider]);
    expect(await taxpayersSeen(outsider, { support: true, readOnly: true })).toBe(0);
  });

  it("en soporte no se puede escribir nada", async () => {
    await expect(
      as(ADMIN, () => app.query("UPDATE taxpayers SET legal_name = 'X' WHERE id = $1", [TAXPAYER]), { tenant: TENANT, support: true, readOnly: true }),
    ).rejects.toThrow(/read-only transaction/);
  });

  it("cada entrada en soporte queda en la auditoría de la organización", async () => {
    await app.query("BEGIN");
    await app.query("SELECT set_config('app.user_id', $1, true)", [ADMIN]);
    const result = await app.query<{ r: string }>("SELECT app.admin_log_support_access($1) AS r", [TENANT]);
    await app.query("COMMIT");
    expect(result.rows[0]?.r).toBe("OK");
    const audit = await owner.query("SELECT count(*)::int AS n FROM audit_events WHERE action = 'platform.support_access' AND tenant_id = $1 AND actor_user_id = $2", [TENANT, ADMIN]);
    expect(audit.rows[0]).toEqual({ n: 1 });
  });
});

describe("suspensiones", () => {
  async function adminCall(sql: string, params: unknown[]): Promise<string | undefined> {
    await app.query("BEGIN");
    try {
      await app.query("SELECT set_config('app.user_id', $1, true)", [ADMIN]);
      const result = await app.query<{ r: string }>(sql, params);
      await app.query("COMMIT");
      return result.rows[0]?.r;
    } catch (error) {
      await app.query("ROLLBACK");
      throw error;
    }
  }

  it("una organización suspendida deja de ser accesible para sus miembros, y se puede reactivar", async () => {
    const memberSees = () => as(MEMBER, async () => (await app.query("SELECT id FROM taxpayers")).rows.length, { tenant: TENANT });
    expect(await memberSees()).toBe(1);
    expect(await adminCall("SELECT app.admin_set_tenant_suspended($1, true, 'Impago') AS r", [TENANT])).toBe("OK");
    expect(await memberSees()).toBe(0);
    expect(await adminCall("SELECT app.admin_set_tenant_suspended($1, false, NULL) AS r", [TENANT])).toBe("OK");
    expect(await memberSees()).toBe(1);
    const audit = await owner.query("SELECT action FROM audit_events WHERE tenant_id = $1 AND action LIKE 'platform.tenant_%' ORDER BY occurred_at", [TENANT]);
    expect(audit.rows.map((row: { action: string }) => row.action)).toEqual(["platform.tenant_suspended", "platform.tenant_reactivated"]);
  });

  it("suspender una cuenta cierra sus sesiones; no se puede suspender uno mismo", async () => {
    await owner.query(`INSERT INTO sessions (user_id, token, expires_at, updated_at) VALUES ($1, 'token-ficticio-plataforma', now() + interval '1 day', now())`, [MEMBER]);
    expect(await adminCall("SELECT app.admin_set_user_suspended($1, true, 'Abuso') AS r", [MEMBER])).toBe("OK");
    const state = await owner.query("SELECT suspended_at IS NOT NULL AS suspended, suspended_reason, (SELECT count(*)::int FROM sessions WHERE user_id = $1) AS sessions FROM users WHERE id = $1", [MEMBER]);
    expect(state.rows[0]).toEqual({ suspended: true, suspended_reason: "Abuso", sessions: 0 });
    expect(await adminCall("SELECT app.admin_set_user_suspended($1, true, 'Yo') AS r", [ADMIN])).toBe("SELF");
    expect(await adminCall("SELECT app.admin_set_user_suspended($1, false, NULL) AS r", [MEMBER])).toBe("OK");
  });
});
