import { withSecurityContext, type Database } from "@facturalibre/database";
import type { Role } from "@facturalibre/security";
import { databaseErrorCode } from "./database-errors";
import { parseOrganizationInput } from "./validation";

export type CreateOrganizationResult =
  | { readonly ok: true; readonly slug: string }
  | { readonly ok: false; readonly reason: "INVALID"; readonly errors: Partial<Record<"name" | "slug", string>> }
  | { readonly ok: false; readonly reason: "SLUG_TAKEN" | "EMAIL_NOT_VERIFIED" };

const asUser = (userId: string) => ({ userId, tenantId: null, taxpayerId: null });

/**
 * Crea una organización con el usuario autenticado como OWNER.
 * La escritura la hace app.create_tenant (SECURITY DEFINER), que además exige el email verificado.
 */
export async function createOrganization(
  db: Database,
  userId: string,
  raw: { readonly name?: unknown; readonly slug?: unknown },
): Promise<CreateOrganizationResult> {
  const parsed = parseOrganizationInput(raw);
  if (!parsed.ok) return { ok: false, reason: "INVALID", errors: parsed.errors };
  const { name, slug } = parsed.value;
  try {
    await withSecurityContext(db, asUser(userId), (tx) => tx.$queryRaw`SELECT app.create_tenant(${name}, ${slug})::text AS id`);
    return { ok: true, slug };
  } catch (error) {
    const code = databaseErrorCode(error);
    if (code === "23505") return { ok: false, reason: "SLUG_TAKEN" };
    if (code === "42501" && String(error).includes("EMAIL_NOT_VERIFIED")) return { ok: false, reason: "EMAIL_NOT_VERIFIED" };
    throw error;
  }
}

export interface MyOrganization {
  readonly slug: string;
  readonly name: string;
  readonly role: Role;
}

/** Organizaciones donde el usuario tiene membresía ACTIVA (selector de organización). */
export async function listMyOrganizations(db: Database, userId: string): Promise<MyOrganization[]> {
  const memberships = await withSecurityContext(db, asUser(userId), (tx) =>
    tx.tenantMembership.findMany({
      where: { userId, status: "ACTIVE", tenant: { status: "ACTIVE" } },
      select: { role: true, tenant: { select: { slug: true, name: true } } },
      orderBy: { tenant: { name: "asc" } },
    }),
  );
  return memberships.map(({ role, tenant }) => ({ slug: tenant.slug, name: tenant.name, role }));
}
