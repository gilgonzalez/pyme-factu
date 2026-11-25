// Pruebas BLOQUEANTES de aislamiento a nivel de PostgreSQL (RLS, permisos, FKs compuestas, auditoría).
// Se conectan con los roles reales de ejecución contra un PostgreSQL 18 real.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { FIXTURE, testClients } from "../src/testing";

const { users, tenants, taxpayers } = FIXTURE;
const urls = inject("dbUrls");

interface Ctx {
  readonly user?: string;
  readonly tenant?: string;
  readonly taxpayer?: string;
}

const clients = testClients();
const connect = (url: string): Promise<pg.Client> => clients.connect(url);

/** Ejecuta `work` en una transacción con contexto de seguridad y la revierte SIEMPRE. */
async function inContext<T>(client: pg.Client, ctx: Ctx, work: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query(
      "SELECT set_config('app.user_id', $1, true), set_config('app.tenant_id', $2, true), set_config('app.taxpayer_id', $3, true)",
      [ctx.user ?? "", ctx.tenant ?? "", ctx.taxpayer ?? ""],
    );
    return await work();
  } finally {
    await client.query("ROLLBACK");
  }
}

const ids = (result: pg.QueryResult): string[] => result.rows.map((row: { id: string }) => row.id).sort();

let app: pg.Client;
let owner: pg.Client;
let worker: pg.Client;
const anaInA: Ctx = { user: users.ana, tenant: tenants.a.id };

beforeAll(async () => {
  app = await connect(urls.app);
  owner = await connect(urls.owner);
  worker = await connect(urls.worker);
});
afterAll(async () => {
  await clients.closeAll();
});

describe("roles de base de datos", () => {
  it("los roles de ejecución no son superusuarios ni tienen BYPASSRLS", async () => {
    const result = await owner.query(
      "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname LIKE 'facturalibre\\_%' ORDER BY rolname",
    );
    expect(result.rows).toEqual([
      { rolname: "facturalibre_app", rolsuper: false, rolbypassrls: false },
      { rolname: "facturalibre_auth", rolsuper: false, rolbypassrls: false },
      { rolname: "facturalibre_worker", rolsuper: false, rolbypassrls: false },
    ]);
  });

  it("ningún rol de ejecución es propietario de tablas", async () => {
    const result = await owner.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tableowner LIKE 'facturalibre\\_%'",
    );
    expect(result.rows).toEqual([]);
  });

  it("todas las tablas de public (salvo el historial de migraciones) tienen RLS habilitado", async () => {
    const result = await owner.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity AND c.relname <> '_prisma_migrations'`,
    );
    expect(result.rows).toEqual([]);
  });
});

describe("sin contexto de seguridad", () => {
  it.each(["tenants", "tenant_memberships", "taxpayers", "taxpayer_settings", "audit_events", "outbox_events", "users"])(
    "%s devuelve cero filas",
    async (table) => {
      const result = await inContext(app, {}, () => app.query(`SELECT * FROM ${table}`));
      expect(result.rowCount).toBe(0);
    },
  );

  it("el rol de aplicación no puede leer sesiones ni cuentas (credenciales)", async () => {
    await expect(inContext(app, anaInA, () => app.query("SELECT * FROM sessions"))).rejects.toThrow(/permission denied/);
    await expect(inContext(app, anaInA, () => app.query("SELECT * FROM accounts"))).rejects.toThrow(/permission denied/);
  });
});

describe("Tenant A no accede a Tenant B", () => {
  it("lee solo su tenant, sus contribuyentes y su auditoría", async () => {
    const [tenantRows, taxpayerRows, auditRows] = await inContext(app, anaInA, async () => [
      await app.query("SELECT id FROM tenants WHERE id = $1 OR id = $2", [tenants.a.id, tenants.b.id]),
      await app.query("SELECT id FROM taxpayers"),
      await app.query("SELECT tenant_id AS id FROM audit_events"),
    ]);
    expect(ids(tenantRows)).toEqual([tenants.a.id]);
    expect(ids(taxpayerRows)).toEqual([taxpayers.a1, taxpayers.a2].sort());
    expect(ids(auditRows)).toEqual([tenants.a.id]);
  });

  it("no lee un contribuyente ajeno aunque conozca su identificador (IDOR)", async () => {
    const result = await inContext(app, anaInA, () => app.query("SELECT * FROM taxpayers WHERE id = $1", [taxpayers.b1]));
    expect(result.rowCount).toBe(0);
  });

  it("si la aplicación fijara el tenant de otro (sin membresía), la base de datos no devuelve nada", async () => {
    const forged: Ctx = { user: users.ana, tenant: tenants.b.id };
    const result = await inContext(app, forged, () => app.query("SELECT id FROM taxpayers UNION ALL SELECT id FROM tenant_invitations"));
    expect(result.rowCount).toBe(0);
  });

  it("no modifica datos de Tenant B", async () => {
    const result = await inContext(app, anaInA, () =>
      app.query("UPDATE taxpayers SET legal_name = 'hackeado' WHERE id = $1", [taxpayers.b1]),
    );
    expect(result.rowCount).toBe(0);
  });

  it("no borra membresías de Tenant B", async () => {
    const result = await inContext(app, anaInA, () =>
      app.query("DELETE FROM tenant_memberships WHERE tenant_id = $1", [tenants.b.id]),
    );
    expect(result.rowCount).toBe(0);
  });

  it("no inserta membresías en Tenant B", async () => {
    const attempt = inContext(app, anaInA, () =>
      app.query("INSERT INTO tenant_memberships (tenant_id, user_id, role, updated_at) VALUES ($1, $2, 'ADMIN', now())", [
        tenants.b.id,
        users.ana,
      ]),
    );
    await expect(attempt).rejects.toThrow(/row-level security/);
  });

  it("no mueve un contribuyente propio a Tenant B", async () => {
    const attempt = inContext(app, anaInA, () =>
      app.query("UPDATE taxpayers SET tenant_id = $1 WHERE id = $2", [tenants.b.id, taxpayers.a1]),
    );
    await expect(attempt).rejects.toThrow(/row-level security/);
  });

  it("no encola trabajos para Tenant B", async () => {
    const attempt = inContext(app, anaInA, () =>
      app.query("INSERT INTO outbox_events (tenant_id, type, payload, idempotency_key) VALUES ($1, 'x', '{}', 'forged')", [tenants.b.id]),
    );
    await expect(attempt).rejects.toThrow(/row-level security/);
  });
});

describe("integridad entre tenants (claves foráneas compuestas, incluso sin RLS)", () => {
  it("una asignación no puede unir un contribuyente de Tenant B con Tenant A", async () => {
    const attempt = inContext(owner, {}, () =>
      owner.query("INSERT INTO taxpayer_memberships (tenant_id, taxpayer_id, user_id) VALUES ($1, $2, $3)", [
        tenants.a.id,
        taxpayers.b1,
        users.carl,
      ]),
    );
    await expect(attempt).rejects.toThrow(/foreign key/);
  });

  it("una asignación exige que el usuario sea miembro del mismo tenant", async () => {
    const attempt = inContext(owner, {}, () =>
      owner.query("INSERT INTO taxpayer_memberships (tenant_id, taxpayer_id, user_id) VALUES ($1, $2, $3)", [
        tenants.b.id,
        taxpayers.b1,
        users.carl,
      ]),
    );
    await expect(attempt).rejects.toThrow(/foreign key/);
  });

  it("solo puede haber un OWNER por tenant", async () => {
    const attempt = inContext(owner, {}, () =>
      owner.query("UPDATE tenant_memberships SET role = 'OWNER' WHERE user_id = $1 AND tenant_id = $2", [users.carl, tenants.a.id]),
    );
    await expect(attempt).rejects.toThrow(/duplicate key|check constraint/);
  });
});

describe("acceso por contribuyente dentro del mismo tenant", () => {
  const carlInA: Ctx = { user: users.carl, tenant: tenants.a.id };

  it("un miembro con alcance ASSIGNED solo ve sus contribuyentes asignados", async () => {
    const result = await inContext(app, carlInA, () => app.query("SELECT id FROM taxpayers"));
    expect(ids(result)).toEqual([taxpayers.a1]);
  });

  it("con acceso READ_ONLY no puede modificar el contribuyente", async () => {
    const result = await inContext(app, carlInA, () =>
      app.query("UPDATE taxpayers SET trade_name = 'x' WHERE id = $1", [taxpayers.a1]),
    );
    expect(result.rowCount).toBe(0);
  });

  it("un miembro SUSPENDIDO no ve nada del tenant", async () => {
    const result = await inContext(app, { user: users.dani, tenant: tenants.a.id }, () =>
      app.query("SELECT id FROM taxpayers UNION ALL SELECT tenant_id FROM tenant_settings"),
    );
    expect(result.rowCount).toBe(0);
  });
});

describe("selector de organización", () => {
  it("sin tenant activo, el usuario ve solo los tenants donde es miembro activo", async () => {
    const result = await inContext(app, { user: users.ana }, () => app.query("SELECT id FROM tenants"));
    expect(ids(result)).toEqual([tenants.a.id]);
  });
});

describe("conexiones reutilizadas", () => {
  it("el contexto de una transacción no sobrevive en la misma conexión", async () => {
    const seenInside = await inContext(app, anaInA, () => app.query("SELECT count(*)::int AS n FROM taxpayers"));
    expect(seenInside.rows[0]).toEqual({ n: 2 });

    // Misma conexión física, transacción nueva sin contexto.
    const leaked = await app.query(
      "SELECT current_setting('app.tenant_id', true) AS tenant, (SELECT count(*)::int FROM taxpayers) AS n",
    );
    expect(leaked.rows[0]).toEqual({ tenant: "", n: 0 });
  });
});

describe("auditoría append-only", () => {
  it("el rol de aplicación no puede modificar ni borrar eventos", async () => {
    await expect(inContext(app, anaInA, () => app.query("UPDATE audit_events SET action = 'x'"))).rejects.toThrow(/permission denied/);
    await expect(inContext(app, anaInA, () => app.query("DELETE FROM audit_events"))).rejects.toThrow(/permission denied/);
  });

  it("ni siquiera el propietario puede modificar eventos (trigger)", async () => {
    await expect(inContext(owner, {}, () => owner.query("UPDATE audit_events SET action = 'x'"))).rejects.toThrow(/append-only/);
  });

  it("un usuario no puede registrar eventos en nombre de otro", async () => {
    const attempt = inContext(app, anaInA, () =>
      app.query("INSERT INTO audit_events (tenant_id, actor_user_id, action, outcome) VALUES ($1, $2, 'x', 'SUCCESS')", [
        tenants.a.id,
        users.bea,
      ]),
    );
    await expect(attempt).rejects.toThrow(/row-level security/);
  });
});

describe("worker", () => {
  it("reclama eventos del outbox de todos los tenants", async () => {
    const result = await inContext(worker, {}, () => worker.query("SELECT tenant_id AS id FROM outbox_events"));
    expect(ids(result)).toEqual([tenants.a.id, tenants.b.id].sort());
  });

  it("no tiene acceso a datos de dominio de los tenants, salvo lo justo para remitir a la AEAT (Fase 6)", async () => {
    for (const table of ["invoices", "invoice_lines", "customers", "products", "users", "tenant_memberships"]) {
      await expect(inContext(worker, { tenant: tenants.a.id }, () => worker.query(`SELECT 1 FROM ${table} LIMIT 1`)), table).rejects.toThrow(/permission denied/);
    }
    // Lee el NIF y el nombre del obligado (cabecera del envío), pero no puede cambiarlos.
    await expect(inContext(worker, { tenant: tenants.a.id }, () => worker.query("SELECT nif FROM taxpayers LIMIT 1"))).resolves.toMatchObject({ command: "SELECT" });
    await expect(inContext(worker, { tenant: tenants.a.id }, () => worker.query("UPDATE taxpayers SET legal_name = 'x'"))).rejects.toThrow(/permission denied/);
  });

  it("de un registro de facturación solo puede cambiar el resultado de su remisión", async () => {
    await expect(inContext(worker, { tenant: tenants.a.id }, () => worker.query("UPDATE billing_records SET xml = '<x/>'"))).rejects.toThrow(/permission denied/);
    await expect(inContext(worker, { tenant: tenants.a.id }, () => worker.query("UPDATE billing_systems SET last_sequence = 0"))).rejects.toThrow(/permission denied/);
    await expect(inContext(worker, { tenant: tenants.a.id }, () => worker.query("INSERT INTO billing_records (id) VALUES (uuidv7())"))).rejects.toThrow(/permission denied/);
    await expect(inContext(worker, { tenant: tenants.a.id }, () => worker.query("UPDATE billing_records SET attempts = attempts WHERE false"))).resolves.toMatchObject({ command: "UPDATE" });
  });

  it("solo audita dentro del tenant fijado en su contexto", async () => {
    const attempt = inContext(worker, { tenant: tenants.a.id }, () =>
      worker.query("INSERT INTO audit_events (tenant_id, action, outcome) VALUES ($1, 'x', 'SUCCESS')", [tenants.b.id]),
    );
    await expect(attempt).rejects.toThrow(/row-level security/);
  });
});
