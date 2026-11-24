import { createHash, randomBytes } from "node:crypto";
import { withSecurityContext, type Database, type Tx } from "@facturalibre/database";
import { decideRoleChange, type Role } from "@facturalibre/security";
import { recordAudit } from "./audit";
import { AuthorizationError, runInTenant } from "./run-in-tenant";
import type { TenantContext } from "./tenant-context";
import { parseInvitationInput, type InvitableRole, type InvitationInput } from "./validation";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La base de datos solo guarda el SHA-256 del token; el token en claro solo viaja en el email. */
export const hashInvitationToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export type InviteMemberResult =
  | {
      readonly ok: true;
      /** Token en claro (32 bytes aleatorios, base64url). Solo para construir el enlace del email. */
      readonly token: string;
      readonly invitation: { readonly id: string; readonly email: string; readonly role: InvitableRole; readonly expiresAt: Date };
    }
  | { readonly ok: false; readonly reason: "INVALID"; readonly errors: Partial<Record<"email" | "role", string>> }
  | { readonly ok: false; readonly reason: "ALREADY_MEMBER" | "SELF_CHANGE" | "OWNER_VIA_TRANSFER_ONLY" | "INSUFFICIENT_RANK" };

const pendingWhere = (tenantId: string) => ({ tenantId, acceptedAt: null, revokedAt: null });

async function createInvitation(tx: Tx, context: TenantContext, input: InvitationInput): Promise<InviteMemberResult> {
  const member = await tx.tenantMembership.findFirst({ where: { tenantId: context.tenant.id, user: { email: input.email } }, select: { id: true } });
  if (member !== null) return { ok: false, reason: "ALREADY_MEMBER" };

  // Reinvitar sustituye la invitación pendiente anterior (como máximo una pendiente por email).
  await tx.tenantInvitation.updateMany({ where: { ...pendingWhere(context.tenant.id), email: input.email }, data: { revokedAt: new Date() } });
  const token = randomBytes(32).toString("base64url");
  const invitation = await tx.tenantInvitation.create({
    data: {
      tenantId: context.tenant.id,
      email: input.email,
      role: input.role,
      taxpayerScope: input.taxpayerScope,
      tokenHash: hashInvitationToken(token),
      invitedByUserId: context.user.id,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    },
    select: { id: true, email: true, expiresAt: true },
  });
  await recordAudit(tx, context, "invitation.created", { type: "tenant_invitation", id: invitation.id }, { email: input.email, role: input.role });
  return { ok: true, token, invitation: { ...invitation, role: input.role } };
}

/** Invita a un email a la organización del contexto (permiso members.invite + reglas anti-escalada). */
export async function inviteMember(
  db: Database,
  context: TenantContext,
  raw: { readonly email?: unknown; readonly role?: unknown; readonly taxpayerScope?: unknown },
): Promise<InviteMemberResult> {
  return runInTenant(db, context, "members.invite", async (tx) => {
    const parsed = parseInvitationInput(raw);
    if (!parsed.ok) return { ok: false, reason: "INVALID", errors: parsed.errors };
    const decision = decideRoleChange({
      actorUserId: context.user.id,
      actorRole: context.membership.role,
      targetUserId: null,
      targetCurrentRole: null,
      newRole: parsed.value.role,
    });
    if (!decision.allowed) {
      if (decision.reason === "MISSING_PERMISSION") throw new AuthorizationError("members.invite");
      return { ok: false, reason: decision.reason };
    }
    return createInvitation(tx, context, parsed.value);
  });
}

export interface PendingInvitation {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
  readonly expiresAt: Date;
  readonly invitedByName: string;
}

/** Invitaciones pendientes y vigentes de la organización del contexto. */
export function listInvitations(db: Database, context: TenantContext): Promise<PendingInvitation[]> {
  return runInTenant(db, context, "members.read", async (tx) => {
    const rows = await tx.tenantInvitation.findMany({
      where: { ...pendingWhere(context.tenant.id), expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, expiresAt: true, invitedBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(({ invitedBy, ...invitation }) => ({ ...invitation, invitedByName: invitedBy.name }));
  });
}

/** Revoca una invitación pendiente. Idempotente en efecto: revocar dos veces devuelve NOT_FOUND la segunda. */
export function revokeInvitation(
  db: Database,
  context: TenantContext,
  invitationId: string,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: "NOT_FOUND" }> {
  return runInTenant(db, context, "members.invite", async (tx) => {
    if (!UUID.test(invitationId)) return { ok: false, reason: "NOT_FOUND" };
    const { count } = await tx.tenantInvitation.updateMany({
      where: { ...pendingWhere(context.tenant.id), id: invitationId },
      data: { revokedAt: new Date() },
    });
    if (count === 0) return { ok: false, reason: "NOT_FOUND" };
    await recordAudit(tx, context, "invitation.revoked", { type: "tenant_invitation", id: invitationId });
    return { ok: true };
  });
}

export type InvitationStatus = "PENDING" | "EXPIRED" | "ACCEPTED" | "REVOKED";

export interface InvitationPreview {
  readonly tenantName: string;
  readonly email: string;
  readonly role: Role;
  readonly status: InvitationStatus;
}

const asUser = (userId: string) => ({ userId, tenantId: null, taxpayerId: null });

/** Datos de la pantalla «Te han invitado a …», o null si el token no existe. */
export async function previewInvitation(db: Database, userId: string, token: string): Promise<InvitationPreview | null> {
  const rows = await withSecurityContext(db, asUser(userId), (tx) =>
    tx.$queryRaw<{ tenant_name: string; email: string; role: Role; status: InvitationStatus }[]>`
      SELECT * FROM app.invitation_preview(${hashInvitationToken(token)})`,
  );
  const row = rows[0];
  return row === undefined ? null : { tenantName: row.tenant_name, email: row.email, role: row.role, status: row.status };
}

export type AcceptInvitationResult = {
  readonly status: "ACCEPTED" | "NOT_FOUND" | "EXPIRED" | "REVOKED" | "EMAIL_MISMATCH" | "EMAIL_NOT_VERIFIED";
  readonly tenantSlug: string | null;
};

/** Acepta la invitación para el usuario autenticado (app.accept_invitation, idempotente). */
export async function acceptInvitation(db: Database, userId: string, token: string): Promise<AcceptInvitationResult> {
  const rows = await withSecurityContext(db, asUser(userId), (tx) =>
    tx.$queryRaw<{ status: AcceptInvitationResult["status"]; tenant_slug: string | null }[]>`
      SELECT * FROM app.accept_invitation(${hashInvitationToken(token)})`,
  );
  const row = rows[0];
  return { status: row?.status ?? "NOT_FOUND", tenantSlug: row?.tenant_slug ?? null };
}
