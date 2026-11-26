import type { Database } from "./client";
import type { Prisma } from "./generated/prisma/client";

/** Cliente transaccional con el contexto de seguridad ya establecido. */
export type Tx = Prisma.TransactionClient;

/**
 * Contexto que PostgreSQL usa en sus políticas RLS.
 * Solo debe construirlo @facturalibre/tenancy tras autenticar y verificar la membresía.
 */
export interface SecurityContext {
  readonly userId: string;
  readonly tenantId: string | null;
  readonly taxpayerId: string | null;
  /**
   * Soporte de la plataforma: un administrador consulta una organización ajena. La transacción se abre en SOLO
   * LECTURA (antes de cualquier consulta) y PostgreSQL solo concede el acceso en transacciones de lectura.
   */
  readonly support?: boolean;
}

/**
 * Ejecuta `work` dentro de UNA transacción cuyo contexto de seguridad se fija con
 * set_config(..., is_local => true) — equivalente a SET LOCAL —, de modo que el contexto
 * desaparece al terminar la transacción y nunca se filtra a otra petición que reutilice
 * la misma conexión del pool.
 */
export async function withSecurityContext<T>(db: Database, context: SecurityContext, work: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    if (context.support === true) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.$executeRaw`SELECT
      set_config('app.user_id', ${context.userId}, true),
      set_config('app.tenant_id', ${context.tenantId ?? ""}, true),
      set_config('app.taxpayer_id', ${context.taxpayerId ?? ""}, true),
      set_config('app.support', ${context.support === true ? "on" : ""}, true)`;
    return work(tx);
  });
}
