"use server";
// Acciones de Contribuyentes: sesión → contexto verificado (con el contribuyente activo cuando aplica) →
// caso de uso de @facturalibre/tenancy (permiso + RLS + auditoría) → mensaje en español.
import { createTaxpayer, setTaxpayerAccess, updateTaxpayer } from "@facturalibre/tenancy";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/action-form";
import { getDatabase } from "@/lib/server/db";
import { formText, reasonMessage, tenantAction } from "@/lib/server/tenant-action";

const REASONS: Readonly<Record<string, string>> = {
  NIF_TAKEN: "Ya hay un contribuyente con ese NIF en esta organización.",
  NOT_FOUND: "Ese miembro o contribuyente ya no está disponible. Recarga la página.",
  SELF_CHANGE: "No puedes cambiar tu propio acceso.",
  ALL_TAXPAYERS_SCOPE: "Esa persona ya accede a todos los contribuyentes por su alcance.",
};

const ACCESS_LEVELS = ["FULL", "READ_ONLY", "NONE"] as const;
type AccessChoice = (typeof ACCESS_LEVELS)[number];
const isAccess = (value: string): value is AccessChoice => (ACCESS_LEVELS as readonly string[]).includes(value);

export async function createTaxpayerAction(slug: string, _previous: ActionResult, data: FormData): Promise<ActionResult> {
  let createdId: string | null = null;
  const result = await tenantAction({ slug, returnPath: `/${slug}/contribuyentes` }, async ({ context }) => {
    const outcome = await createTaxpayer(getDatabase(), context, Object.fromEntries(data));
    if (outcome.ok) {
      createdId = outcome.taxpayer.id;
      return { ok: true, message: "" };
    }
    return outcome.reason === "INVALID" ? { ok: false, message: "", errors: outcome.errors } : reasonMessage(REASONS, outcome.reason);
  });
  if (createdId !== null) redirect(`/${slug}/contribuyentes/${createdId}`);
  return result;
}

export async function updateTaxpayerAction(slug: string, taxpayerId: string, _previous: ActionResult, data: FormData): Promise<ActionResult> {
  return tenantAction({ slug, returnPath: `/${slug}/contribuyentes/${taxpayerId}`, taxpayerId }, async ({ context }) => {
    const outcome = await updateTaxpayer(getDatabase(), context, Object.fromEntries(data));
    return outcome.ok ? { ok: true, message: "Datos guardados." } : { ok: false, message: "", errors: outcome.errors };
  });
}

export async function setTaxpayerAccessAction(slug: string, taxpayerId: string, _previous: ActionResult, data: FormData): Promise<ActionResult> {
  return tenantAction({ slug, returnPath: `/${slug}/contribuyentes/${taxpayerId}` }, async ({ context }) => {
    const access = formText(data, "access");
    if (!isAccess(access)) return { ok: false, message: "Elige un nivel de acceso." };
    const outcome = await setTaxpayerAccess(getDatabase(), context, { taxpayerId, membershipId: formText(data, "membershipId"), access });
    return outcome.ok ? { ok: true, message: "Acceso actualizado." } : reasonMessage(REASONS, outcome.reason);
  });
}
