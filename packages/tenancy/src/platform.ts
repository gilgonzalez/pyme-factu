// Administración de la plataforma (superadmin). Toda comprobación de que el usuario es administrador la hace
// PostgreSQL (app.require_platform_admin en cada función app.admin_*); aquí solo se traducen los resultados.
// Solo metadatos de organizaciones, cuentas y registros VERI*FACTU; el contenido de una organización solo se ve
// en modo soporte, de solo lectura y auditado.
import { withSecurityContext, type Database, type Tx } from "@facturalibre/database";
import { buildSupportContext, type ResolveTenantContextResult } from "./tenant-context";

export class PlatformAdminRequiredError extends Error {
  constructor() {
    super("Solo para administradores de la plataforma.");
    this.name = "PlatformAdminRequiredError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])$/;
const REASON_MAX = 500;

/** Fila de una función app.admin_*: columnas snake_case → camelCase y recuentos (bigint) → number. */
function fromRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), typeof value === "bigint" ? Number(value) : value]),
  );
}

async function adminRows<T>(db: Database, userId: string, query: (tx: Tx) => Promise<Record<string, unknown>[]>): Promise<T[]> {
  const rows = await asUser(db, userId, query);
  return rows.map(fromRow) as T[];
}

/** Transacción como el usuario (sin organización); la falta de privilegios de la base de datos se traduce. */
async function asUser<T>(db: Database, userId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await withSecurityContext(db, { userId, tenantId: null, taxpayerId: null }, work);
  } catch (error) {
    if (error instanceof Error && error.message.includes("PLATFORM_ADMIN_REQUIRED")) throw new PlatformAdminRequiredError();
    throw error;
  }
}

export async function isPlatformAdmin(db: Database, userId: string): Promise<boolean> {
  if (!UUID.test(userId)) return false;
  const rows = await asUser(db, userId, (tx) => tx.$queryRaw<{ admin: boolean }[]>`SELECT app.is_platform_admin() AS admin`);
  return rows[0]?.admin === true;
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export interface PlatformOverview {
  readonly users: number;
  readonly verifiedUsers: number;
  readonly suspendedUsers: number;
  readonly tenants: number;
  readonly suspendedTenants: number;
  readonly taxpayers: number;
  readonly issuedInvoices: number;
  readonly draftInvoices: number;
  readonly pendingRecords: number;
  readonly rejectedRecords: number;
}

export async function platformOverview(db: Database, userId: string): Promise<PlatformOverview> {
  const rows = await asUser(db, userId, (tx) => tx.$queryRaw<{ overview: PlatformOverview }[]>`SELECT app.admin_overview() AS overview`);
  const overview = rows[0]?.overview;
  if (overview === undefined) throw new Error("admin_overview sin resultado");
  return overview;
}

export interface PlatformTenant {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly createdAt: Date;
  readonly suspendedAt: Date | null;
  readonly suspendedReason: string | null;
  readonly members: number;
  readonly taxpayers: number;
  readonly issuedInvoices: number;
  readonly draftInvoices: number;
  readonly lastIssuedAt: Date | null;
}

export function listPlatformTenants(db: Database, userId: string): Promise<PlatformTenant[]> {
  return adminRows<PlatformTenant>(db, userId, (tx) => tx.$queryRaw`SELECT * FROM app.admin_tenants()`);
}

export interface PlatformUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly createdAt: Date;
  readonly deactivatedAt: Date | null;
  readonly suspendedAt: Date | null;
  readonly suspendedReason: string | null;
  readonly organizations: number;
  readonly isAdmin: boolean;
}

export function listPlatformUsers(db: Database, userId: string): Promise<PlatformUser[]> {
  return adminRows<PlatformUser>(db, userId, (tx) => tx.$queryRaw`SELECT * FROM app.admin_users()`);
}

export interface VerifactuStatusRow {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly taxpayerId: string;
  readonly taxpayerName: string;
  readonly taxpayerNif: string;
  readonly pending: number;
  readonly accepted: number;
  readonly acceptedWithErrors: number;
  readonly rejected: number;
  readonly oldestPendingAt: Date | null;
  readonly lastErrorCode: string | null;
  readonly lastErrorDescription: string | null;
  readonly lastErrorAt: Date | null;
}

export function listVerifactuStatus(db: Database, userId: string): Promise<VerifactuStatusRow[]> {
  return adminRows<VerifactuStatusRow>(db, userId, (tx) => tx.$queryRaw`SELECT * FROM app.admin_verifactu()`);
}

// ─── Suspensiones (auditadas en la base de datos) ────────────────────────────

export interface SuspensionInput {
  readonly suspended: boolean;
  readonly reason: string | null;
}

type SuspensionResult = { readonly ok: true } | { readonly ok: false; readonly reason: "NOT_FOUND" | "SELF" | "INVALID" };

const cleanReason = (reason: string | null): string | null => {
  const text = reason?.trim() ?? "";
  return text === "" ? null : text;
};

const resultOf = (code: string | undefined): SuspensionResult =>
  code === "OK" ? { ok: true } : { ok: false, reason: code === "SELF" ? "SELF" : "NOT_FOUND" };

type SuspendQuery = (tx: Tx, id: string, suspended: boolean, reason: string | null) => Promise<{ result: string }[]>;

async function suspend(db: Database, userId: string, id: string, input: SuspensionInput, query: SuspendQuery): Promise<SuspensionResult> {
  const reason = cleanReason(input.reason);
  if (!UUID.test(id)) return { ok: false, reason: "NOT_FOUND" };
  if (reason !== null && reason.length > REASON_MAX) return { ok: false, reason: "INVALID" };
  const rows = await asUser(db, userId, (tx) => query(tx, id, input.suspended, reason));
  return resultOf(rows[0]?.result);
}

export const setTenantSuspension = (db: Database, userId: string, input: SuspensionInput & { readonly tenantId: string }): Promise<SuspensionResult> =>
  suspend(db, userId, input.tenantId, input, (tx, id, suspended, reason) => tx.$queryRaw`SELECT app.admin_set_tenant_suspended(${id}::uuid, ${suspended}, ${reason}) AS result`);

export const setUserSuspension = (db: Database, userId: string, input: SuspensionInput & { readonly userId: string }): Promise<SuspensionResult> =>
  suspend(db, userId, input.userId, input, (tx, id, suspended, reason) => tx.$queryRaw`SELECT app.admin_set_user_suspended(${id}::uuid, ${suspended}, ${reason}) AS result`);

// ─── Modo soporte (solo lectura) ─────────────────────────────────────────────

export interface SupportInput {
  readonly userId: string;
  readonly tenantSlug: string;
  readonly taxpayerId: string | null;
  readonly requestId: string;
}

const TENANT_NOT_FOUND = { ok: false, reason: "TENANT_NOT_FOUND" } as const;

/** Contexto de soporte para una petición (sin auditar: la entrada se audita una vez, al abrir el soporte). */
export async function resolveSupportContext(db: Database, input: SupportInput): Promise<ResolveTenantContextResult> {
  if (!UUID.test(input.userId) || !SLUG.test(input.tenantSlug)) return TENANT_NOT_FOUND;
  if (!(await isPlatformAdmin(db, input.userId))) return TENANT_NOT_FOUND;
  const tenants = await asUser(
    db,
    input.userId,
    (tx) => tx.$queryRaw<{ id: string; slug: string; name: string }[]>`SELECT id, slug, name FROM app.admin_find_tenant(${input.tenantSlug})`,
  );
  const tenant = tenants[0];
  if (tenant === undefined) return TENANT_NOT_FOUND;
  const taxpayerId = input.taxpayerId;
  if (taxpayerId !== null) {
    if (!UUID.test(taxpayerId)) return { ok: false, reason: "TAXPAYER_NOT_FOUND" };
    const found = await withSecurityContext(db, { userId: input.userId, tenantId: tenant.id, taxpayerId: null, support: true }, (tx) =>
      tx.taxpayer.findFirst({ where: { id: taxpayerId, tenantId: tenant.id }, select: { id: true } }),
    );
    if (found === null) return { ok: false, reason: "TAXPAYER_NOT_FOUND" };
  }
  return { ok: true, context: buildSupportContext({ userId: input.userId, tenant, taxpayerId, requestId: input.requestId }) };
}

/** Abre el soporte de una organización: registra el acceso en su auditoría y devuelve el contexto de lectura. */
export async function openSupportContext(db: Database, input: SupportInput): Promise<ResolveTenantContextResult> {
  const resolved = await resolveSupportContext(db, input);
  if (!resolved.ok) return resolved;
  await asUser(db, input.userId, (tx) => tx.$queryRaw`SELECT app.admin_log_support_access(${resolved.context.tenant.id}::uuid)`);
  return resolved;
}
