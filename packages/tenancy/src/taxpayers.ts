import { randomUUID } from "node:crypto";
import type { Database, Tx } from "@facturalibre/database";
import { nifErrorMessage, parseNif, type NifPersonType } from "@facturalibre/domain";
import type { Role } from "@facturalibre/security";
import { recordAudit } from "./audit";
import { databaseErrorCode } from "./database-errors";
import { AuthorizationError, runInTenant } from "./run-in-tenant";
import type { TenantContext } from "./tenant-context";
import { parseTaxpayerDetails, type TaxpayerField } from "./validation";

export type TaxpayerAccessLevel = "FULL" | "READ_ONLY";
type Scope = "ALL_TAXPAYERS" | "ASSIGNED_TAXPAYERS";

/** ÚNICA regla de acceso efectivo: alcance total → FULL; si no, el nivel asignado (o ninguno). */
export function effectiveTaxpayerAccess(scope: Scope, assigned: TaxpayerAccessLevel | undefined): TaxpayerAccessLevel | null {
  return scope === "ALL_TAXPAYERS" ? "FULL" : (assigned ?? null);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Raw = Readonly<Record<string, unknown>>;
type Invalid = { readonly ok: false; readonly reason: "INVALID"; readonly errors: Partial<Record<TaxpayerField, string>> };

// ─── Alta ────────────────────────────────────────────────────────────────────

export type CreateTaxpayerResult =
  | { readonly ok: true; readonly taxpayer: { readonly id: string; readonly nif: string; readonly legalName: string; readonly personType: NifPersonType } }
  | Invalid
  | { readonly ok: false; readonly reason: "NIF_TAKEN" };

function parseNewTaxpayer(raw: Raw) {
  const nif = parseNif(raw["nif"]);
  const details = parseTaxpayerDetails(raw);
  if (nif.ok && details.ok) return { ok: true as const, nif: nif.value, details: details.value };
  const errors = { ...(nif.ok ? {} : { nif: nifErrorMessage(nif.error) }), ...(details.ok ? {} : details.errors) };
  return { ok: false as const, errors };
}

/**
 * Da de alta un contribuyente en la organización del contexto (taxpayers.create). El tipo de persona
 * se deduce del NIF. Si quien lo crea tiene alcance ASSIGNED, recibe acceso FULL en la misma transacción.
 */
export async function createTaxpayer(db: Database, context: TenantContext, raw: Raw): Promise<CreateTaxpayerResult> {
  try {
    return await runInTenant(db, context, "taxpayers.create", async (tx) => {
      const parsed = parseNewTaxpayer(raw);
      if (!parsed.ok) return { ok: false, reason: "INVALID", errors: parsed.errors };
      const { nif, details } = parsed;
      const id = randomUUID();
      const tenantId = context.tenant.id;
      // createMany: sin RETURNING, que exigiría poder LEER la fila antes de tener acceso a ella.
      await tx.taxpayer.createMany({ data: [{ id, tenantId, nif: nif.nif, personType: nif.personType, ...details }] });
      if (context.membership.taxpayerScope === "ASSIGNED_TAXPAYERS") {
        await tx.taxpayerMembership.createMany({ data: [{ tenantId, taxpayerId: id, userId: context.user.id, accessLevel: "FULL" }] });
      }
      await tx.taxpayerSettings.createMany({ data: [{ tenantId, taxpayerId: id }] });
      await recordAudit(tx, context, "taxpayer.created", { type: "taxpayer", id }, { nif: nif.nif });
      return { ok: true, taxpayer: { id, nif: nif.nif, legalName: details.legalName, personType: nif.personType } };
    });
  } catch (error) {
    if (databaseErrorCode(error) === "23505") return { ok: false, reason: "NIF_TAKEN" };
    throw error;
  }
}

// ─── Consulta ────────────────────────────────────────────────────────────────

export interface TaxpayerSummary {
  readonly id: string;
  readonly nif: string;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly personType: NifPersonType;
  readonly status: "ACTIVE" | "DEACTIVATED";
  readonly access: TaxpayerAccessLevel;
}

/** Contribuyentes a los que el usuario del contexto tiene acceso (RLS), con su nivel de acceso. */
export function listTaxpayers(db: Database, context: TenantContext): Promise<TaxpayerSummary[]> {
  return runInTenant(db, context, "taxpayers.read", async (tx) => {
    const rows = await tx.taxpayer.findMany({
      where: { tenantId: context.tenant.id },
      select: {
        id: true,
        nif: true,
        legalName: true,
        tradeName: true,
        personType: true,
        status: true,
        memberships: { where: { userId: context.user.id }, select: { accessLevel: true } },
      },
      orderBy: { legalName: "asc" },
    });
    return rows.flatMap(({ memberships, ...taxpayer }) => {
      const access = effectiveTaxpayerAccess(context.membership.taxpayerScope, memberships[0]?.accessLevel);
      return access === null ? [] : [{ ...taxpayer, access }];
    });
  });
}

export interface TaxpayerRecord extends TaxpayerSummary {
  readonly addressLine: string | null;
  readonly postalCode: string | null;
  readonly city: string | null;
  readonly province: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly registryInfo: string | null;
}

/** Ficha completa del contribuyente ACTIVO del contexto (el acceso ya se verificó al resolver el contexto). */
export function getTaxpayer(db: Database, context: TenantContext): Promise<TaxpayerRecord> {
  return runInTenant(db, context, "taxpayers.read", async (tx) => {
    const active = context.taxpayer;
    if (active === null) throw new AuthorizationError("taxpayers.read");
    const taxpayer = await tx.taxpayer.findFirstOrThrow({
      where: { id: active.id, tenantId: context.tenant.id },
      select: {
        id: true,
        nif: true,
        personType: true,
        legalName: true,
        tradeName: true,
        addressLine: true,
        postalCode: true,
        city: true,
        province: true,
        email: true,
        phone: true,
        website: true,
        registryInfo: true,
        status: true,
      },
    });
    return { ...taxpayer, access: active.access };
  });
}

// ─── Edición ─────────────────────────────────────────────────────────────────

/** Actualiza los datos del contribuyente ACTIVO del contexto (taxpayers.update: requiere acceso FULL). */
export function updateTaxpayer(db: Database, context: TenantContext, raw: Raw): Promise<{ readonly ok: true } | Invalid> {
  return runInTenant(db, context, "taxpayers.update", async (tx) => {
    const taxpayer = context.taxpayer;
    if (taxpayer === null) throw new AuthorizationError("taxpayers.update");
    const parsed = parseTaxpayerDetails(raw);
    if (!parsed.ok) return { ok: false, reason: "INVALID", errors: parsed.errors };
    await tx.taxpayer.updateMany({ where: { id: taxpayer.id, tenantId: context.tenant.id }, data: parsed.value });
    await recordAudit(tx, context, "taxpayer.updated", { type: "taxpayer", id: taxpayer.id });
    return { ok: true };
  });
}

// ─── Acceso por miembro ──────────────────────────────────────────────────────

/** Nivel de acceso del usuario del contexto al contribuyente, o null si no lo ve (RLS) o no existe. */
async function actorAccess(tx: Tx, context: TenantContext, taxpayerId: string): Promise<TaxpayerAccessLevel | null> {
  if (!UUID.test(taxpayerId)) return null;
  const taxpayer = await tx.taxpayer.findFirst({
    where: { id: taxpayerId, tenantId: context.tenant.id },
    select: { memberships: { where: { userId: context.user.id }, select: { accessLevel: true } } },
  });
  return taxpayer === null ? null : effectiveTaxpayerAccess(context.membership.taxpayerScope, taxpayer.memberships[0]?.accessLevel);
}

export interface TaxpayerAccessEntry {
  readonly membershipId: string;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
  readonly scope: Scope;
  readonly access: TaxpayerAccessLevel | "NONE";
}

/** Quién accede a un contribuyente y con qué nivel (taxpayers.manage_access). Vacío si no se ve. */
export function listTaxpayerAccess(db: Database, context: TenantContext, taxpayerId: string): Promise<TaxpayerAccessEntry[]> {
  return runInTenant(db, context, "taxpayers.manage_access", async (tx) => {
    if ((await actorAccess(tx, context, taxpayerId)) === null) return [];
    const members = await tx.tenantMembership.findMany({
      where: { tenantId: context.tenant.id, status: "ACTIVE" },
      select: {
        id: true,
        role: true,
        taxpayerScope: true,
        user: { select: { name: true, email: true } },
        taxpayerMemberships: { where: { taxpayerId }, select: { accessLevel: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return members.map((member) => ({
      membershipId: member.id,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      scope: member.taxpayerScope,
      access: effectiveTaxpayerAccess(member.taxpayerScope, member.taxpayerMemberships[0]?.accessLevel) ?? "NONE",
    }));
  });
}

export interface SetTaxpayerAccessInput {
  readonly taxpayerId: string;
  readonly membershipId: string;
  readonly access: TaxpayerAccessLevel | "NONE";
}

export type SetTaxpayerAccessResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "NOT_FOUND" | "SELF_CHANGE" | "ALL_TAXPAYERS_SCOPE" };

/**
 * Concede, cambia o retira (NONE) el acceso de un miembro con alcance ASSIGNED a un contribuyente.
 * Quien lo hace necesita taxpayers.manage_access y acceso FULL a ese contribuyente; nunca sobre sí mismo.
 * Idempotente.
 */
export function setTaxpayerAccess(db: Database, context: TenantContext, input: SetTaxpayerAccessInput): Promise<SetTaxpayerAccessResult> {
  return runInTenant(db, context, "taxpayers.manage_access", async (tx) => {
    const target = UUID.test(input.membershipId)
      ? await tx.tenantMembership.findFirst({ where: { id: input.membershipId, tenantId: context.tenant.id }, select: { userId: true, taxpayerScope: true } })
      : null;
    if (target === null) return { ok: false, reason: "NOT_FOUND" };
    if (target.userId === context.user.id) return { ok: false, reason: "SELF_CHANGE" };
    if ((await actorAccess(tx, context, input.taxpayerId)) !== "FULL") return { ok: false, reason: "NOT_FOUND" };
    if (target.taxpayerScope === "ALL_TAXPAYERS") return { ok: false, reason: "ALL_TAXPAYERS_SCOPE" };

    const key = { taxpayerId: input.taxpayerId, userId: target.userId };
    if (input.access === "NONE") {
      await tx.taxpayerMembership.deleteMany({ where: key });
    } else {
      await tx.taxpayerMembership.upsert({
        where: { taxpayerId_userId: key },
        create: { ...key, tenantId: context.tenant.id, accessLevel: input.access },
        update: { accessLevel: input.access },
      });
    }
    await recordAudit(tx, context, "taxpayer.access_changed", { type: "taxpayer", id: input.taxpayerId }, {
      membershipId: input.membershipId,
      access: input.access,
    });
    return { ok: true };
  });
}
