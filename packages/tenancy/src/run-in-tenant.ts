import { withSecurityContext, type Database, type Tx } from "@facturalibre/database";
import type { Permission } from "@facturalibre/security";
import type { TenantContext } from "./tenant-context";

export class AuthorizationError extends Error {
  constructor(readonly permission: Permission) {
    super(`Permiso requerido: ${permission}`);
    this.name = "AuthorizationError";
  }
}

/**
 * ÚNICO punto de entrada para leer o escribir datos de un tenant:
 *  1. comprueba el permiso con la autorización centralizada;
 *  2. abre una transacción con el contexto de seguridad del tenant/contribuyente (SET LOCAL);
 *  3. PostgreSQL aplica RLS como segunda barrera.
 */
export async function runInTenant<T>(db: Database, context: TenantContext, permission: Permission, work: (tx: Tx) => Promise<T>): Promise<T> {
  if (!context.permissions.has(permission)) {
    throw new AuthorizationError(permission);
  }
  return withSecurityContext(
    db,
    { userId: context.user.id, tenantId: context.tenant.id, taxpayerId: context.taxpayer?.id ?? null, support: context.support },
    work,
  );
}
