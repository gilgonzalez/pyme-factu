import "server-only";
import { AuthorizationError, type TenantContext } from "@facturalibre/tenancy";
import { refresh } from "next/cache";
import type { ActionResult } from "@/components/action-form";
import { requireTenant, type SessionUser } from "./session";

export interface TenantActionTarget {
  readonly slug: string;
  /** Ruta a la que volver si hay que iniciar sesión. */
  readonly returnPath: string;
  /** Contribuyente activo, si la acción es sobre uno concreto. */
  readonly taxpayerId?: string;
}

/**
 * Envoltorio ÚNICO de las Server Actions de una organización: sesión → contexto verificado →
 * caso de uso → refresh() si fue bien. La falta de permiso se convierte en un mensaje.
 */
export async function tenantAction(
  target: TenantActionTarget,
  work: (input: { user: SessionUser; context: TenantContext }) => Promise<ActionResult>,
): Promise<ActionResult> {
  try {
    const result = await work(await requireTenant(target.slug, target.returnPath, target.taxpayerId ?? null));
    if (result?.ok === true) refresh();
    return result;
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, message: "No tienes permiso para hacer esto." };
    throw error;
  }
}

/** Mensaje en español para un motivo de rechazo de un caso de uso. */
export const reasonMessage = (messages: Readonly<Record<string, string>>, reason: string): ActionResult => ({
  ok: false,
  message: messages[reason] ?? "No se ha podido completar la operación.",
});

/** Texto de un campo de formulario ("" si falta o no es texto). */
export function formText(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}
