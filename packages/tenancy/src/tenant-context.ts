import { withSecurityContext, type Database } from "@facturalibre/database";
import { effectiveTaxpayerAccess } from "./taxpayers";
import { effectivePermissions, type Permission, type Role, type TaxpayerAccess } from "@facturalibre/security";

declare const tenantContextBrand: unique symbol;

/**
 * Contexto de una petición autenticada dentro de un tenant. Solo lo construye
 * `resolveTenantContext` (marca nominal), tras verificar la membresía en el servidor.
 */
export type TenantContext = {
  readonly user: { readonly id: string };
  readonly tenant: { readonly id: string; readonly slug: string; readonly name: string };
  readonly membership: {
    readonly id: string;
    readonly role: Role;
    readonly taxpayerScope: "ALL_TAXPAYERS" | "ASSIGNED_TAXPAYERS";
  };
  /** Contribuyente activo, o null si la operación no es fiscal. */
  readonly taxpayer: { readonly id: string; readonly access: Exclude<TaxpayerAccess, "NONE"> } | null;
  readonly permissions: ReadonlySet<Permission>;
  readonly audit: { readonly requestId: string };
  /** Soporte de la plataforma: un administrador consulta en SOLO LECTURA una organización de la que no es miembro. */
  readonly support: boolean;
} & { readonly [tenantContextBrand]: true };

export interface ResolveTenantContextInput {
  /** Identificador del usuario AUTENTICADO (procede de la sesión del servidor, nunca del cliente). */
  readonly userId: string;
  /** Datos NO confiables recibidos del navegador (URL, cookie, formulario). */
  readonly tenantSlug: string;
  readonly taxpayerId: string | null;
  readonly requestId: string;
}

export type ResolveTenantContextResult =
  | { readonly ok: true; readonly context: TenantContext }
  // Un tenant inexistente y uno ajeno producen la MISMA respuesta: no se revela su existencia.
  | { readonly ok: false; readonly reason: "TENANT_NOT_FOUND" | "TAXPAYER_NOT_FOUND" }
  // La organización existe y el usuario es miembro, pero la plataforma la ha suspendido.
  | { readonly ok: false; readonly reason: "TENANT_SUSPENDED" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Mismo formato que la restricción CHECK tenants_slug_format. */
const SLUG = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])$/;

const TENANT_NOT_FOUND = { ok: false, reason: "TENANT_NOT_FOUND" } as const;
const TAXPAYER_NOT_FOUND = { ok: false, reason: "TAXPAYER_NOT_FOUND" } as const;

type Membership = TenantContext["membership"] & { readonly tenant: TenantContext["tenant"] & { readonly suspendedAt: Date | null } };

function findActiveMembership(db: Database, userId: string, tenantSlug: string): Promise<Membership | null> {
  return withSecurityContext(db, { userId, tenantId: null, taxpayerId: null }, (tx) =>
    tx.tenantMembership.findFirst({
      where: { userId, status: "ACTIVE", tenant: { slug: tenantSlug } },
      select: { id: true, role: true, taxpayerScope: true, tenant: { select: { id: true, slug: true, name: true, suspendedAt: true } } },
    }),
  );
}

async function findTaxpayerAccess(
  db: Database,
  userId: string,
  membership: Membership,
  taxpayerId: string,
): Promise<Exclude<TaxpayerAccess, "NONE"> | null> {
  const taxpayer = await withSecurityContext(db, { userId, tenantId: membership.tenant.id, taxpayerId: null }, (tx) =>
    tx.taxpayer.findFirst({
      where: { id: taxpayerId },
      select: { memberships: { where: { userId }, select: { accessLevel: true } } },
    }),
  );
  if (taxpayer === null) return null;
  return effectiveTaxpayerAccess(membership.taxpayerScope, taxpayer.memberships[0]?.accessLevel);
}

/**
 * Resuelve y verifica en el servidor el contexto de tenant (y opcionalmente de contribuyente)
 * de una petición. Todas las lecturas pasan por RLS con el contexto del propio usuario.
 */
export async function resolveTenantContext(db: Database, input: ResolveTenantContextInput): Promise<ResolveTenantContextResult> {
  if (!UUID.test(input.userId) || !SLUG.test(input.tenantSlug)) return TENANT_NOT_FOUND;

  const membership = await findActiveMembership(db, input.userId, input.tenantSlug);
  if (membership === null) return TENANT_NOT_FOUND;
  if (membership.tenant.suspendedAt !== null) return { ok: false, reason: "TENANT_SUSPENDED" };

  let taxpayer: TenantContext["taxpayer"] = null;
  if (input.taxpayerId !== null) {
    if (!UUID.test(input.taxpayerId)) return TAXPAYER_NOT_FOUND;
    const access = await findTaxpayerAccess(db, input.userId, membership, input.taxpayerId);
    if (access === null) return TAXPAYER_NOT_FOUND;
    taxpayer = { id: input.taxpayerId, access };
  }

  const { tenant: fullTenant, ...memberData } = membership;
  const tenant = { id: fullTenant.id, slug: fullTenant.slug, name: fullTenant.name };
  const context = {
    user: { id: input.userId },
    tenant,
    membership: memberData,
    taxpayer,
    permissions: effectivePermissions(membership.role, taxpayer?.access ?? "NONE"),
    audit: { requestId: input.requestId },
    support: false,
  } as TenantContext;
  return { ok: true, context };
}

/**
 * Contexto de SOPORTE (solo lectura) para un administrador de la plataforma. Solo lo llama platform.ts tras
 * comprobar en la base de datos que es administrador y registrar el acceso. Permisos de un VIEWER y, además,
 * la base de datos solo concede el acceso dentro de transacciones de lectura.
 */
export function buildSupportContext(input: {
  readonly userId: string;
  readonly tenant: TenantContext["tenant"];
  readonly taxpayerId: string | null;
  readonly requestId: string;
}): TenantContext {
  const taxpayer = input.taxpayerId === null ? null : { id: input.taxpayerId, access: "READ_ONLY" as const };
  return {
    user: { id: input.userId },
    tenant: input.tenant,
    membership: { id: "soporte", role: "VIEWER", taxpayerScope: "ALL_TAXPAYERS" },
    taxpayer,
    permissions: effectivePermissions("VIEWER", taxpayer === null ? "NONE" : "READ_ONLY"),
    audit: { requestId: input.requestId },
    support: true,
  } as TenantContext;
}
