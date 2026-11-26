// Contribuyente «de trabajo» de una organización: el último abierto (cookie) si sigue siendo accesible, o el
// primero. Solo decide qué secciones enseña el lateral; el acceso real lo comprueba siempre el servidor.

/** Nombre de la cookie de preferencia, por organización. */
export const workingTaxpayerCookie = (tenantId: string): string => `fl-contribuyente-${tenantId}`;

/** El recordado si está entre los accesibles; si no, el primero; null si no hay ninguno. */
export function pickWorkingTaxpayer<T extends { readonly id: string }>(accessible: readonly T[], remembered: string | undefined): T | null {
  return accessible.find((taxpayer) => taxpayer.id === remembered) ?? accessible[0] ?? null;
}
