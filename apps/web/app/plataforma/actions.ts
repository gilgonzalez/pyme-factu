"use server";
// Acciones de la administración de la plataforma. Cada una comprueba que quien la usa es administrador (la base
// de datos lo vuelve a comprobar y deja auditoría de todo).
import { openSupportContext, PlatformAdminRequiredError, setTenantSuspension, setUserSuspension } from "@facturalibre/tenancy";
import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/action-form";
import { getDatabase } from "@/lib/server/db";
import { requirePlatformAdmin } from "@/lib/server/platform";
import { SUPPORT_COOKIE, SUPPORT_MAX_AGE_SECONDS } from "@/lib/server/support";
import { formText } from "@/lib/server/tenant-action";

const PANEL = "/plataforma";
const REASONS: Readonly<Record<string, string>> = {
  NOT_FOUND: "Ya no existe. Recarga la página.",
  SELF: "No puedes suspender tu propia cuenta.",
  INVALID: "El motivo puede tener como mucho 500 caracteres.",
};

async function adminAction(work: (userId: string) => Promise<ActionResult>): Promise<ActionResult> {
  const user = await requirePlatformAdmin(PANEL);
  try {
    const result = await work(user.id);
    if (result?.ok === true) refresh();
    return result;
  } catch (error) {
    if (error instanceof PlatformAdminRequiredError) return { ok: false, message: "Solo para administradores de la plataforma." };
    throw error;
  }
}

const outcome = (result: { readonly ok: true } | { readonly ok: false; readonly reason: string }, done: string): ActionResult =>
  result.ok ? { ok: true, message: done } : { ok: false, message: REASONS[result.reason] ?? "No se ha podido completar." };

export async function suspendTenantAction(tenantId: string, _previous: ActionResult, data: FormData): Promise<ActionResult> {
  return adminAction(async (userId) =>
    outcome(await setTenantSuspension(getDatabase(), userId, { tenantId, suspended: true, reason: formText(data, "reason") }), "Organización suspendida."),
  );
}

export async function reactivateTenantAction(tenantId: string): Promise<ActionResult> {
  return adminAction(async (userId) => outcome(await setTenantSuspension(getDatabase(), userId, { tenantId, suspended: false, reason: null }), "Organización reactivada."));
}

export async function suspendUserAction(targetId: string, _previous: ActionResult, data: FormData): Promise<ActionResult> {
  return adminAction(async (userId) =>
    outcome(await setUserSuspension(getDatabase(), userId, { userId: targetId, suspended: true, reason: formText(data, "reason") }), "Cuenta suspendida y sesiones cerradas."),
  );
}

export async function reactivateUserAction(targetId: string): Promise<ActionResult> {
  return adminAction(async (userId) => outcome(await setUserSuspension(getDatabase(), userId, { userId: targetId, suspended: false, reason: null }), "Cuenta reactivada."));
}

/** Abre el soporte (solo lectura) de una organización: queda en su auditoría y caduca a la hora. */
export async function enterSupportAction(slug: string): Promise<ActionResult> {
  const user = await requirePlatformAdmin(PANEL);
  const requestId = (await headers()).get("x-request-id") ?? crypto.randomUUID();
  const opened = await openSupportContext(getDatabase(), { userId: user.id, tenantSlug: slug, taxpayerId: null, requestId });
  if (!opened.ok) return { ok: false, message: "Esa organización ya no existe." };
  (await cookies()).set(SUPPORT_COOKIE, slug, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: SUPPORT_MAX_AGE_SECONDS,
  });
  redirect(`/${slug}`);
}

export async function exitSupportAction(): Promise<ActionResult> {
  (await cookies()).delete(SUPPORT_COOKIE);
  redirect(PANEL);
}
