"use server";
// Acciones de facturas del contribuyente activo: guardar borrador, emitir, borrar borrador y rectificar.
import { createDraftInvoice, deleteDraftInvoice, issueInvoice, rectifyInvoice, updateDraftInvoice } from "@facturalibre/tenancy";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/action-form";
import { fieldsFromFormData, linesFromFormData } from "@/lib/invoicing";
import { getDatabase } from "@/lib/server/db";
import { reasonMessage, tenantAction } from "@/lib/server/tenant-action";

const REASONS: Readonly<Record<string, string>> = {
  NOT_FOUND: "Esa factura ya no existe. Recarga la página.",
  NOT_DRAFT: "La factura ya está emitida: no se puede cambiar. Si hay un error, rectifícala.",
  NOT_ISSUED: "Solo se rectifican facturas emitidas. Un borrador se corrige editándolo.",
};

const base = (slug: string, taxpayerId: string): string => `/${slug}/contribuyentes/${taxpayerId}/facturas`;
const target = (slug: string, taxpayerId: string, path: string) => ({ slug, taxpayerId, returnPath: path });
const invalid = (errors: Readonly<Record<string, string>>): ActionResult => ({
  ok: false,
  message: "Revisa los campos marcados.",
  errors,
});

/** Guarda un borrador nuevo (invoiceId null) o existente y abre su ficha. */
export async function saveDraftAction(slug: string, taxpayerId: string, invoiceId: string | null, _previous: ActionResult, data: FormData): Promise<ActionResult> {
  const raw = { ...fieldsFromFormData(data), lines: linesFromFormData(data) };
  let savedId: string | null = null;
  const result = await tenantAction(target(slug, taxpayerId, base(slug, taxpayerId)), async ({ context }) => {
    const db = getDatabase();
    const outcome =
      invoiceId === null
        ? await createDraftInvoice(db, context, raw)
        : await updateDraftInvoice(db, context, invoiceId, raw).then((result) => (result.ok ? { ok: true as const, invoiceId } : result));
    if (outcome.ok) {
      savedId = outcome.invoiceId;
      return { ok: true, message: "" };
    }
    return outcome.reason === "INVALID" ? invalid(outcome.errors) : reasonMessage(REASONS, outcome.reason);
  });
  if (savedId !== null) redirect(`${base(slug, taxpayerId)}/${savedId}`);
  return result;
}

/** Emite y vuelve a la ficha con el aviso de confirmación (las acciones de borrador desaparecen al emitir). */
export async function issueAction(slug: string, taxpayerId: string, invoiceId: string): Promise<ActionResult> {
  const detail = `${base(slug, taxpayerId)}/${invoiceId}`;
  let issued: string | null = null;
  const result = await tenantAction(target(slug, taxpayerId, detail), async ({ context }) => {
    const outcome = await issueInvoice(getDatabase(), context, invoiceId);
    if (!outcome.ok) return reasonMessage(REASONS, outcome.reason);
    issued = outcome.number;
    return { ok: true, message: "" };
  });
  if (issued !== null) redirect(`${detail}?emitida=${encodeURIComponent(issued)}`);
  return result;
}

export async function deleteDraftAction(slug: string, taxpayerId: string, invoiceId: string): Promise<ActionResult> {
  let deleted = false;
  const result = await tenantAction(target(slug, taxpayerId, `${base(slug, taxpayerId)}/${invoiceId}`), async ({ context }) => {
    const outcome = await deleteDraftInvoice(getDatabase(), context, invoiceId);
    deleted = outcome.ok;
    return outcome.ok ? { ok: true, message: "" } : reasonMessage(REASONS, outcome.reason);
  });
  if (deleted) redirect(base(slug, taxpayerId));
  return result;
}

export async function rectifyAction(slug: string, taxpayerId: string, invoiceId: string, _previous: ActionResult, data: FormData): Promise<ActionResult> {
  let draftId: string | null = null;
  const result = await tenantAction(target(slug, taxpayerId, `${base(slug, taxpayerId)}/${invoiceId}`), async ({ context }) => {
    const outcome = await rectifyInvoice(getDatabase(), context, invoiceId, { reason: data.get("reason") });
    if (outcome.ok) {
      draftId = outcome.invoiceId;
      return { ok: true, message: "" };
    }
    return outcome.reason === "INVALID" ? invalid(outcome.errors) : reasonMessage(REASONS, outcome.reason);
  });
  if (draftId !== null) redirect(`${base(slug, taxpayerId)}/${draftId}/editar`);
  return result;
}
