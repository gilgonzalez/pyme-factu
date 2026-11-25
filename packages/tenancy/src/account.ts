// Derechos sobre los datos de la propia cuenta (Fase 7; RGPD arts. 15 y 20) y desactivación. Las comprobaciones
// viven en funciones SECURITY DEFINER limitadas al usuario del contexto (migración 20261125000700).
import { withSecurityContext, type Database } from "@facturalibre/database";

export interface PersonalData {
  readonly usuario: Readonly<Record<string, unknown>>;
  readonly organizaciones: readonly Readonly<Record<string, unknown>>[];
  readonly sesiones: readonly Readonly<Record<string, unknown>>[];
  readonly actividad: readonly { readonly fecha: string; readonly accion: string; readonly organizacion: string | null; readonly entidad: string | null }[];
}

const asUser = <T>(db: Database, userId: string, work: Parameters<typeof withSecurityContext<T>>[2]): Promise<T> =>
  withSecurityContext(db, { userId, tenantId: null, taxpayerId: null }, work);

/** Copia de los datos personales de la cuenta en JSON (perfil, organizaciones, sesiones, actividad propia). */
export function exportMyData(db: Database, userId: string): Promise<PersonalData | null> {
  return asUser(db, userId, async (tx) => {
    const [row] = await tx.$queryRaw<{ data: PersonalData | null }[]>`SELECT app.my_personal_data() AS data`;
    return row?.data ?? null;
  });
}

export type DeactivateResult = { readonly ok: true } | { readonly ok: false; readonly reason: "SOLE_OWNER" };

/** Desactiva la propia cuenta; no si dejaría una organización activa sin propietario. */
export function deactivateMyAccount(db: Database, userId: string): Promise<DeactivateResult> {
  return asUser(db, userId, async (tx): Promise<DeactivateResult> => {
    const [row] = await tx.$queryRaw<{ result: string }[]>`SELECT app.deactivate_my_account() AS result`;
    return row?.result === "OK" ? { ok: true } : { ok: false, reason: "SOLE_OWNER" };
  });
}
