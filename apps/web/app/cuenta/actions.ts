"use server";
// Desactivar la propia cuenta (Fase 7): sin acceso; se conservan la autoría en la auditoría y lo fiscal.
import { deactivateMyAccount } from "@facturalibre/tenancy";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/action-form";
import { getDatabase } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";

export async function deactivateAccountAction(_previous: ActionResult, data: FormData): Promise<ActionResult> {
  const user = await requireUser("/cuenta");
  if (data.get("email") !== user.email) return { ok: false, message: "Revisa los campos marcados.", errors: { email: "Escribe el email de tu cuenta para confirmar." } };
  const result = await deactivateMyAccount(getDatabase(), user.id);
  if (!result.ok) {
    return { ok: false, message: "Eres el único propietario de una organización activa: transfiere antes la propiedad a otra persona del equipo." };
  }
  // Sus sesiones ya están cerradas: la siguiente página pedirá iniciar sesión.
  redirect("/entrar?cuenta=desactivada");
}
