// Alta de organizaciones e invitaciones a nivel de PostgreSQL (funciones SECURITY DEFINER del esquema app).
// Se ejecutan con el rol real de aplicación (facturalibre_app) y el contexto de seguridad del usuario.
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

const urls = inject("dbUrls");
const clients: pg.Client[] = [];
let app: pg.Client;
let owner: pg.Client;
let auth: pg.Client;

async function connect(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  clients.push(client);
  return client;
}

/** Ejecuta `work` en una transacción confirmada con el usuario como contexto (sin tenant). */
async function asUser<T>(userId: string, work: () => Promise<T>): Promise<T> {
  await app.query("BEGIN");
  try {
    await app.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    const result = await work();
    await app.query("COMMIT");
    return result;
  } catch (error) {
    await app.query("ROLLBACK");
    throw error;
  }
}

async function createUser(email: string, verified = true): Promise<string> {
  const id = randomUUID();
  await owner.query("INSERT INTO users (id, name, email, email_verified, updated_at) VALUES ($1, $2, $3, $4, now())", [
    id,
    `Usuario ${email}`,
    email,
    verified,
  ]);
  return id;
}

const unique = (): string => randomUUID().slice(0, 8);
const sha256 = (token: string): string => createHash("sha256").update(token).digest("hex");

async function createTenant(userId: string, slug: string, name = "Organización ficticia"): Promise<string> {
  const result = await asUser(userId, () => app.query<{ id: string }>("SELECT app.create_tenant($1, $2) AS id", [name, slug]));
  return result.rows[0]!.id;
}

async function invite(tenantId: string, invitedBy: string, email: string, options: { expiresIn?: string; role?: string } = {}): Promise<string> {
  const token = randomUUID();
  await owner.query(
    `INSERT INTO tenant_invitations (tenant_id, email, role, token_hash, invited_by_user_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + $6::interval)`,
    [tenantId, email, options.role ?? "EMPLOYEE", sha256(token), invitedBy, options.expiresIn ?? "7 days"],
  );
  return token;
}

type Acceptance = { status: string; tenant_slug: string | null };
const accept = (userId: string, token: string): Promise<Acceptance> =>
  asUser(userId, async () => (await app.query<Acceptance>("SELECT * FROM app.accept_invitation($1)", [sha256(token)])).rows[0]!);

beforeAll(async () => {
  app = await connect(urls.app);
  owner = await connect(urls.owner);
  auth = await connect(urls.auth);
});
afterAll(async () => {
  await Promise.all(clients.map((client) => client.end()));
});

describe("app.create_tenant", () => {
  it("crea la organización con su configuración y al usuario como OWNER, y lo audita", async () => {
    const user = await createUser(`owner-${unique()}@example.test`);
    const slug = `org-${unique()}`;
    const tenantId = await createTenant(user, slug, "Mi Empresa (ficticia)");

    const membership = await owner.query("SELECT user_id, role, taxpayer_scope, status FROM tenant_memberships WHERE tenant_id = $1", [tenantId]);
    expect(membership.rows).toEqual([{ user_id: user, role: "OWNER", taxpayer_scope: "ALL_TAXPAYERS", status: "ACTIVE" }]);
    const tenant = await owner.query("SELECT slug, name FROM tenants WHERE id = $1", [tenantId]);
    expect(tenant.rows).toEqual([{ slug, name: "Mi Empresa (ficticia)" }]);
    const settings = await owner.query("SELECT currency FROM tenant_settings WHERE tenant_id = $1", [tenantId]);
    expect(settings.rows).toEqual([{ currency: "EUR" }]);
    const audit = await owner.query("SELECT actor_user_id, action, outcome FROM audit_events WHERE tenant_id = $1", [tenantId]);
    expect(audit.rows).toEqual([{ actor_user_id: user, action: "tenant.created", outcome: "SUCCESS" }]);
  });

  it("exige un usuario autenticado en el contexto", async () => {
    await expect(asUser("", () => app.query("SELECT app.create_tenant('X', $1)", [`org-${unique()}`]))).rejects.toThrow(/AUTH_REQUIRED/);
  });

  it("exige el email verificado", async () => {
    const user = await createUser(`unverified-${unique()}@example.test`, false);
    await expect(createTenant(user, `org-${unique()}`)).rejects.toThrow(/EMAIL_NOT_VERIFIED/);
  });

  it("rechaza un slug ya usado sin crear nada", async () => {
    const user = await createUser(`dup-${unique()}@example.test`);
    const slug = `org-${unique()}`;
    await createTenant(user, slug);
    await expect(createTenant(user, slug)).rejects.toMatchObject({ code: "23505" });
  });

  it("el rol de aplicación sigue sin poder insertar tenants directamente", async () => {
    await expect(app.query("INSERT INTO tenants (slug, name, updated_at) VALUES ($1, 'X', now())", [`org-${unique()}`])).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("invitaciones", () => {
  let tenantId: string;
  let tenantSlug: string;
  let inviter: string;

  beforeAll(async () => {
    inviter = await createUser(`inviter-${unique()}@example.test`);
    tenantSlug = `org-${unique()}`;
    tenantId = await createTenant(inviter, tenantSlug, "Organización Invitante (ficticia)");
  });

  it("la vista previa muestra la organización y el estado sin ser miembro", async () => {
    const email = `preview-${unique()}@example.test`;
    const token = await invite(tenantId, inviter, email, { role: "ACCOUNTANT" });
    const stranger = await createUser(`stranger-${unique()}@example.test`);
    const preview = await asUser(stranger, () => app.query("SELECT * FROM app.invitation_preview($1)", [sha256(token)]));
    expect(preview.rows).toEqual([{ tenant_name: "Organización Invitante (ficticia)", email, role: "ACCOUNTANT", status: "PENDING" }]);
  });

  it("la vista previa de un token desconocido no devuelve nada", async () => {
    const preview = await asUser(inviter, () => app.query("SELECT * FROM app.invitation_preview($1)", [sha256("no-existe")]));
    expect(preview.rows).toEqual([]);
  });

  it("aceptar crea la membresía con el rol invitado, marca la invitación y audita", async () => {
    const email = `invitee-${unique()}@example.test`;
    const token = await invite(tenantId, inviter, email, { role: "ACCOUNTANT" });
    const invitee = await createUser(email);

    expect(await accept(invitee, token)).toEqual({ status: "ACCEPTED", tenant_slug: tenantSlug });

    const membership = await owner.query("SELECT role, status FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2", [tenantId, invitee]);
    expect(membership.rows).toEqual([{ role: "ACCOUNTANT", status: "ACTIVE" }]);
    const invitation = await owner.query("SELECT accepted_by_user_id FROM tenant_invitations WHERE token_hash = $1", [sha256(token)]);
    expect(invitation.rows).toEqual([{ accepted_by_user_id: invitee }]);
    const audit = await owner.query("SELECT action FROM audit_events WHERE tenant_id = $1 AND actor_user_id = $2", [tenantId, invitee]);
    expect(audit.rows).toEqual([{ action: "invitation.accepted" }]);
  });

  it("aceptar dos veces es idempotente", async () => {
    const email = `twice-${unique()}@example.test`;
    const token = await invite(tenantId, inviter, email);
    const invitee = await createUser(email);
    await accept(invitee, token);
    expect(await accept(invitee, token)).toEqual({ status: "ACCEPTED", tenant_slug: tenantSlug });
    const count = await owner.query("SELECT count(*)::int AS n FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2", [tenantId, invitee]);
    expect(count.rows).toEqual([{ n: 1 }]);
  });

  it("no se puede aceptar con otra cuenta de email", async () => {
    const token = await invite(tenantId, inviter, `target-${unique()}@example.test`);
    const other = await createUser(`other-${unique()}@example.test`);
    expect(await accept(other, token)).toEqual({ status: "EMAIL_MISMATCH", tenant_slug: null });
  });

  it("no se puede aceptar sin verificar el email", async () => {
    const email = `unverified-invitee-${unique()}@example.test`;
    const token = await invite(tenantId, inviter, email);
    const invitee = await createUser(email, false);
    expect(await accept(invitee, token)).toEqual({ status: "EMAIL_NOT_VERIFIED", tenant_slug: null });
  });

  it("no se puede aceptar una invitación caducada, revocada o inexistente", async () => {
    const expiredEmail = `expired-${unique()}@example.test`;
    const expired = await invite(tenantId, inviter, expiredEmail, { expiresIn: "-1 minute" });
    expect(await accept(await createUser(expiredEmail), expired)).toEqual({ status: "EXPIRED", tenant_slug: null });

    const revokedEmail = `revoked-${unique()}@example.test`;
    const revoked = await invite(tenantId, inviter, revokedEmail);
    await owner.query("UPDATE tenant_invitations SET revoked_at = now() WHERE token_hash = $1", [sha256(revoked)]);
    expect(await accept(await createUser(revokedEmail), revoked)).toEqual({ status: "REVOKED", tenant_slug: null });

    expect(await accept(inviter, "no-existe")).toEqual({ status: "NOT_FOUND", tenant_slug: null });
  });

  it("si ya era miembro, la invitación se marca aceptada sin duplicar la membresía ni cambiar su rol", async () => {
    const email = `member-${unique()}@example.test`;
    const member = await createUser(email);
    await owner.query(
      "INSERT INTO tenant_memberships (tenant_id, user_id, role, updated_at) VALUES ($1, $2, 'VIEWER', now())",
      [tenantId, member],
    );
    const token = await invite(tenantId, inviter, email, { role: "ADMIN" });
    expect(await accept(member, token)).toEqual({ status: "ACCEPTED", tenant_slug: tenantSlug });
    const membership = await owner.query("SELECT role FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2", [tenantId, member]);
    expect(membership.rows).toEqual([{ role: "VIEWER" }]);
  });
});

describe("rate limiting de autenticación", () => {
  it("el rol de autenticación gestiona la tabla rate_limits y el de aplicación no la ve", async () => {
    const key = `test:${unique()}`;
    await auth.query("INSERT INTO rate_limits (key, count, last_request) VALUES ($1, 1, $2)", [key, Date.now()]);
    await auth.query("UPDATE rate_limits SET count = count + 1 WHERE key = $1", [key]);
    const row = await auth.query("SELECT count FROM rate_limits WHERE key = $1", [key]);
    expect(row.rows).toEqual([{ count: 2 }]);
    await expect(app.query("SELECT * FROM rate_limits")).rejects.toThrow(/permission denied/);
  });
});
