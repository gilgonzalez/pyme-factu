"use server";
import { acceptInvitation } from "@facturalibre/tenancy";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/action-form";
import { getDatabase } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";

const MESSAGES: Readonly<Record<string, string>> = {
  NOT_FOUND: "Esta invitación no existe o ya la ha usado otra persona.",
  EXPIRED: "La invitación ha caducado. Pide a la organización que te invite de nuevo.",
  REVOKED: "La organización ha anulado esta invitación.",
  EMAIL_MISMATCH: "La invitación es para otro email. Inicia sesión con la cuenta a la que se envió.",
  EMAIL_NOT_VERIFIED: "Confirma tu email antes de aceptar la invitación.",
};

// El token va enlazado con bind; los argumentos que añade useActionState (estado previo, datos) no se usan.
export async function acceptInvitationAction(token: string): Promise<ActionResult> {
  const user = await requireUser(`/invitacion/${token}`);
  const result = await acceptInvitation(getDatabase(), user.id, token);
  if (result.status === "ACCEPTED" && result.tenantSlug !== null) redirect(`/${result.tenantSlug}`);
  return { ok: false, message: MESSAGES[result.status] ?? "No se ha podido aceptar la invitación." };
}
