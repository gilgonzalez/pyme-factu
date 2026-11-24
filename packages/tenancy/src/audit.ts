import type { Tx } from "@facturalibre/database";
import type { TenantContext } from "./tenant-context";

/** Acciones de negocio auditadas por este paquete (verbo en notación punto). */
export type AuditAction =
  | "invitation.created"
  | "invitation.revoked"
  | "member.role_changed"
  | "member.removed"
  | "tenant.ownership_transferred"
  | "taxpayer.created"
  | "taxpayer.updated"
  | "taxpayer.access_changed"
  | "invoice.issued"
  | "invoice.draft_deleted"
  | "invoice.rectification_created";

/**
 * Registra un evento de auditoría en la MISMA transacción que el cambio (o ambos o ninguno).
 * Nunca incluir en `metadata` contraseñas, tokens, claves ni certificados.
 */
export async function recordAudit(
  tx: Tx,
  context: TenantContext,
  action: AuditAction,
  entity: { readonly type: string; readonly id: string },
  metadata?: Readonly<Record<string, string>>,
): Promise<void> {
  await tx.auditEvent.create({
    data: {
      actorUserId: context.user.id,
      tenantId: context.tenant.id,
      action,
      entityType: entity.type,
      entityId: entity.id,
      outcome: "SUCCESS",
      requestId: context.audit.requestId,
      ...(metadata === undefined ? {} : { metadata }),
    },
  });
}
