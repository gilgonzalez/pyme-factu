import type { Database, Tx } from "@facturalibre/database";
import { decideMemberRemoval, decideRoleChange, type Role } from "@facturalibre/security";
import { recordAudit } from "./audit";
import { AuthorizationError, runInTenant } from "./run-in-tenant";
import type { TenantContext } from "./tenant-context";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Member {
  readonly membershipId: string;
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
  readonly status: "ACTIVE" | "SUSPENDED";
}

/** Miembros de la organización del contexto, por antigüedad. */
export function listMembers(db: Database, context: TenantContext): Promise<Member[]> {
  return runInTenant(db, context, "members.read", async (tx) => {
    const rows = await tx.tenantMembership.findMany({
      where: { tenantId: context.tenant.id },
      select: { id: true, role: true, status: true, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(({ id, role, status, user }) => ({ membershipId: id, userId: user.id, name: user.name, email: user.email, role, status }));
  });
}

type Failure<Reason extends string> = { readonly ok: false; readonly reason: Reason };
type Outcome<Reason extends string> = { readonly ok: true } | Failure<Reason>;
const OK = { ok: true } as const;
const NOT_FOUND = { ok: false, reason: "NOT_FOUND" } as const;

function findTarget(tx: Tx, context: TenantContext, membershipId: string) {
  if (!UUID.test(membershipId)) return Promise.resolve(null);
  return tx.tenantMembership.findFirst({
    where: { id: membershipId, tenantId: context.tenant.id },
    select: { id: true, userId: true, role: true, status: true },
  });
}

export type ChangeRoleReason = "NOT_FOUND" | "SELF_CHANGE" | "OWNER_VIA_TRANSFER_ONLY" | "INSUFFICIENT_RANK";

/** Cambia el rol de un miembro (members.update_role + reglas anti-escalada). */
export function changeMemberRole(db: Database, context: TenantContext, membershipId: string, newRole: Role): Promise<Outcome<ChangeRoleReason>> {
  return runInTenant(db, context, "members.update_role", async (tx) => {
    const target = await findTarget(tx, context, membershipId);
    if (target === null) return NOT_FOUND;
    const decision = decideRoleChange({
      actorUserId: context.user.id,
      actorRole: context.membership.role,
      targetUserId: target.userId,
      targetCurrentRole: target.role,
      newRole,
    });
    if (!decision.allowed) {
      if (decision.reason === "MISSING_PERMISSION") throw new AuthorizationError("members.update_role");
      return { ok: false, reason: decision.reason };
    }
    await tx.tenantMembership.update({ where: { id: target.id }, data: { role: newRole } });
    await recordAudit(tx, context, "member.role_changed", { type: "tenant_membership", id: target.id }, { from: target.role, to: newRole });
    return OK;
  });
}

/** Quita a un miembro de la organización: pierde el acceso en la siguiente petición. */
export function removeMember(
  db: Database,
  context: TenantContext,
  membershipId: string,
): Promise<Outcome<"NOT_FOUND" | "SELF_CHANGE" | "INSUFFICIENT_RANK">> {
  return runInTenant(db, context, "members.remove", async (tx) => {
    const target = await findTarget(tx, context, membershipId);
    if (target === null) return NOT_FOUND;
    const decision = decideMemberRemoval({
      actorUserId: context.user.id,
      actorRole: context.membership.role,
      targetUserId: target.userId,
      targetRole: target.role,
    });
    if (!decision.allowed) {
      if (decision.reason === "MISSING_PERMISSION") throw new AuthorizationError("members.remove");
      return { ok: false, reason: decision.reason };
    }
    // Las asignaciones a contribuyentes se borran en cascada (FK compuesta). La auditoría conserva el rastro.
    await tx.tenantMembership.delete({ where: { id: target.id } });
    await recordAudit(tx, context, "member.removed", { type: "tenant_membership", id: target.id }, { userId: target.userId, role: target.role });
    return OK;
  });
}

/**
 * Transfiere la propiedad a otro miembro ACTIVO. Exige una sesión reciente (reautenticación).
 * En una transacción: el OWNER actual pasa a ADMIN y el destinatario a OWNER (el índice único
 * parcial tenant_memberships_one_owner garantiza que nunca haya dos).
 */
export function transferOwnership(
  db: Database,
  context: TenantContext,
  membershipId: string,
  session: { readonly sessionIsFresh: boolean },
): Promise<Outcome<"STALE_SESSION" | "NOT_FOUND" | "SELF_CHANGE">> {
  return runInTenant(db, context, "tenant.transfer_ownership", async (tx) => {
    if (!session.sessionIsFresh) return { ok: false, reason: "STALE_SESSION" };
    const target = await findTarget(tx, context, membershipId);
    if (target?.status !== "ACTIVE") return NOT_FOUND;
    if (target.id === context.membership.id) return { ok: false, reason: "SELF_CHANGE" };

    await tx.tenantMembership.update({ where: { id: context.membership.id }, data: { role: "ADMIN", taxpayerScope: "ALL_TAXPAYERS" } });
    await tx.tenantMembership.update({ where: { id: target.id }, data: { role: "OWNER", taxpayerScope: "ALL_TAXPAYERS" } });
    await recordAudit(tx, context, "tenant.ownership_transferred", { type: "tenant_membership", id: target.id }, {
      fromUserId: context.user.id,
      toUserId: target.userId,
    });
    return OK;
  });
}
