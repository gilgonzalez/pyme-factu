// Datos FICTICIOS para pruebas de aislamiento. Se insertan con el rol propietario (fuera de RLS).
// Ninguna persona, empresa ni NIF corresponde a datos reales.
import pg from "pg";

export const FIXTURE = {
  users: {
    /** OWNER de Tenant A. */
    ana: "01900000-0000-7000-8000-00000000a001",
    /** OWNER de Tenant B. */
    bea: "01900000-0000-7000-8000-00000000b001",
    /** EMPLOYEE de Tenant A, solo asignado a taxpayerA1 con acceso de solo lectura. */
    carl: "01900000-0000-7000-8000-00000000a002",
    /** Miembro SUSPENDIDO de Tenant A. */
    dani: "01900000-0000-7000-8000-00000000a003",
  },
  tenants: {
    a: { id: "01900000-0000-7000-8000-0000000000aa", slug: "empresa-alfa" },
    b: { id: "01900000-0000-7000-8000-0000000000bb", slug: "gestoria-beta" },
  },
  taxpayers: {
    a1: "01900000-0000-7000-8000-000000000a01",
    a2: "01900000-0000-7000-8000-000000000a02",
    b1: "01900000-0000-7000-8000-000000000b01",
  },
} as const;

const { users: U, tenants: T, taxpayers: P } = FIXTURE;

const STATEMENTS: ReadonlyArray<readonly [string, readonly string[]]> = [
  [
    `INSERT INTO users (id, name, email, updated_at) VALUES
      ($1, 'Ana Ficticia', 'ana@example.test', now()), ($2, 'Bea Ficticia', 'bea@example.test', now()),
      ($3, 'Carl Ficticio', 'carl@example.test', now()), ($4, 'Dani Ficticio', 'dani@example.test', now())`,
    [U.ana, U.bea, U.carl, U.dani],
  ],
  [
    `INSERT INTO tenants (id, slug, name, updated_at) VALUES
      ($1, $2, 'Empresa Alfa (ficticia)', now()), ($3, $4, 'Gestoría Beta (ficticia)', now())`,
    [T.a.id, T.a.slug, T.b.id, T.b.slug],
  ],
  [`INSERT INTO tenant_settings (tenant_id, updated_at) VALUES ($1, now()), ($2, now())`, [T.a.id, T.b.id]],
  [
    `INSERT INTO tenant_memberships (tenant_id, user_id, role, taxpayer_scope, status, updated_at) VALUES
      ($1, $3, 'OWNER', 'ALL_TAXPAYERS', 'ACTIVE', now()),
      ($2, $4, 'OWNER', 'ALL_TAXPAYERS', 'ACTIVE', now()),
      ($1, $5, 'EMPLOYEE', 'ASSIGNED_TAXPAYERS', 'ACTIVE', now()),
      ($1, $6, 'ACCOUNTANT', 'ALL_TAXPAYERS', 'SUSPENDED', now())`,
    [T.a.id, T.b.id, U.ana, U.bea, U.carl, U.dani],
  ],
  [
    `INSERT INTO taxpayers (id, tenant_id, person_type, nif, legal_name, updated_at) VALUES
      ($1, $4, 'LEGAL_ENTITY', 'B00000001', 'Alfa Uno SL (ficticia)', now()),
      ($2, $4, 'NATURAL_PERSON', '00000002X', 'Alfa Dos (ficticio)', now()),
      ($3, $5, 'LEGAL_ENTITY', 'B00000003', 'Beta Uno SL (ficticia)', now())`,
    [P.a1, P.a2, P.b1, T.a.id, T.b.id],
  ],
  [
    `INSERT INTO taxpayer_settings (taxpayer_id, tenant_id, updated_at) VALUES ($1, $4, now()), ($2, $4, now()), ($3, $5, now())`,
    [P.a1, P.a2, P.b1, T.a.id, T.b.id],
  ],
  [`INSERT INTO taxpayer_memberships (tenant_id, taxpayer_id, user_id, access_level) VALUES ($1, $2, $3, 'READ_ONLY')`, [T.a.id, P.a1, U.carl]],
  [
    `INSERT INTO audit_events (tenant_id, actor_user_id, action, outcome) VALUES
      ($1, $3, 'fixture.seed', 'SUCCESS'), ($2, $4, 'fixture.seed', 'SUCCESS')`,
    [T.a.id, T.b.id, U.ana, U.bea],
  ],
  [
    `INSERT INTO outbox_events (tenant_id, type, payload, idempotency_key) VALUES
      ($1, 'fixture.event', '{}', 'fixture-a'), ($2, 'fixture.event', '{}', 'fixture-b')`,
    [T.a.id, T.b.id],
  ],
];

/** Inserta los datos ficticios. Llamar una sola vez por base de datos de pruebas. */
export async function seedIsolationFixtures(ownerUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const [sql, params] of STATEMENTS) {
      await client.query(sql, [...params]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
