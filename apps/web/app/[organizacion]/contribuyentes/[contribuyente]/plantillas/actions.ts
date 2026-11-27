"use server";
// Acciones de las plantillas de factura del contribuyente activo: guardar (nueva o existente) y borrar.
import { deleteInvoiceTemplate, saveInvoiceTemplate } from "@facturalibre/tenancy";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/action-form";
import { fieldsFromFormData, linesFromFormData } from "@/lib/invoicing";
import { getDatabase } from "@/lib/server/db";
import { reasonMessage, tenantAction } from "@/lib/server/tenant-action";

const REASONS: Readonly<Record<string, string>> = { NOT_FOUND: "Esa plantilla ya no existe. Recarga la página." };

const templatesPath = (slug: string, taxpayerId: string): string => `/${slug}/contribuyentes/${taxpayerId}/plantillas`;

/** Guarda una plantilla nueva (templateId null) o existente y vuelve a la lista de plantillas. */
export async function saveTemplateAction(slug: string, taxpayerId: string, templateId: string | null, _previous: ActionResult, data: FormData): Promise<ActionResult> {
  const raw = { ...fieldsFromFormData(data), lines: linesFromFormData(data) };
  let saved = false;
  const result = await tenantAction({ slug, taxpayerId, returnPath: templatesPath(slug, taxpayerId) }, async ({ context }) => {
    const outcome = await saveInvoiceTemplate(getDatabase(), context, templateId, raw);
    if (outcome.ok) {
      saved = true;
      return { ok: true, message: "" };
    }
    return outcome.reason === "INVALID" ? { ok: false, message: "Revisa los campos marcados.", errors: outcome.errors } : reasonMessage(REASONS, outcome.reason);
  });
  if (saved) redirect(templatesPath(slug, taxpayerId));
  return result;
}

export async function deleteTemplateAction(slug: string, taxpayerId: string, templateId: string): Promise<ActionResult> {
  return tenantAction({ slug, taxpayerId, returnPath: templatesPath(slug, taxpayerId) }, async ({ context }) => {
    const outcome = await deleteInvoiceTemplate(getDatabase(), context, templateId);
    return outcome.ok ? { ok: true, message: "Plantilla borrada." } : reasonMessage(REASONS, outcome.reason);
  });
}
