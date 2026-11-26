"use server";
// Acciones de facturas del contribuyente activo: guardar borrador, emitir, borrar borrador, rectificar y enviar al cliente.
import { documentMessage } from "@facturalibre/auth";
import { formatAmount } from "@facturalibre/fiscal-core";
import {
  annulInvoice,
  createDraftInvoice,
  deleteDraftInvoice,
  getInvoice,
  getTaxpayer,
  getTaxpayerLogo,
  issueInvoice,
  parseInvoiceSendInput,
  recordInvoiceSent,
  rectifyInvoice,
  updateDraftInvoice,
} from "@facturalibre/tenancy";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/action-form";
import { fieldsFromFormData, linesFromFormData } from "@/lib/invoicing";
import { getMailer } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/db";
import { documentTitle, invoicePdf, pdfFilename } from "@/lib/server/invoice-pdf";
import { reasonMessage, tenantAction } from "@/lib/server/tenant-action";
import { verifactuSettings } from "@/lib/server/verifactu";

const REASONS: Readonly<Record<string, string>> = {
  NOT_FOUND: "Esa factura ya no existe. Recarga la página.",
  NOT_DRAFT: "La factura ya está emitida: no se puede cambiar. Si hay un error, rectifícala.",
  NOT_ISSUED: "Solo se rectifican o anulan facturas emitidas. Un borrador se corrige editándolo.",
  ANNULLED: "Esta factura está anulada: no se puede rectificar.",
  ALREADY_ANNULLED: "Esta factura ya estaba anulada.",
  NOT_REGISTERED: "Esta factura se emitió antes de VERI*FACTU y no tiene registro que anular.",
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
    const outcome = await issueInvoice(getDatabase(), context, invoiceId, verifactuSettings());
    if (outcome.ok) {
      issued = outcome.number;
      return { ok: true, message: "" };
    }
    if (outcome.reason !== "NOT_REGISTRABLE") return reasonMessage(REASONS, outcome.reason);
    // La AEAT rechazaría el registro: no se emite. Se explica qué corregir antes.
    return { ok: false, message: `No se puede emitir todavía: ${Object.values(outcome.errors).join(" ")}` };
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
  if (deleted) redirect(`/${slug}/contribuyentes/${taxpayerId}/borradores`);
  return result;
}

export async function rectifyAction(slug: string, taxpayerId: string, invoiceId: string, _previous: ActionResult, data: FormData): Promise<ActionResult> {
  let draftId: string | null = null;
  const result = await tenantAction(target(slug, taxpayerId, `${base(slug, taxpayerId)}/${invoiceId}`), async ({ context }) => {
    const outcome = await rectifyInvoice(getDatabase(), context, invoiceId, { reason: data.get("reason"), code: data.get("code") });
    if (outcome.ok) {
      draftId = outcome.invoiceId;
      return { ok: true, message: "" };
    }
    return outcome.reason === "INVALID" ? invalid(outcome.errors) : reasonMessage(REASONS, outcome.reason);
  });
  if (draftId !== null) redirect(`${base(slug, taxpayerId)}/${draftId}/editar`);
  return result;
}

/** Anula una factura expedida por error: genera su registro de anulación VERI*FACTU (ADR-008). */
export async function annulAction(slug: string, taxpayerId: string, invoiceId: string, _previous: ActionResult, data: FormData): Promise<ActionResult> {
  const detail = `${base(slug, taxpayerId)}/${invoiceId}`;
  let annulled = false;
  const result = await tenantAction(target(slug, taxpayerId, detail), async ({ context }) => {
    const outcome = await annulInvoice(getDatabase(), context, invoiceId, { reason: data.get("reason") }, verifactuSettings());
    if (outcome.ok) {
      annulled = true;
      return { ok: true, message: "" };
    }
    return outcome.reason === "INVALID" ? invalid(outcome.errors) : reasonMessage(REASONS, outcome.reason);
  });
  if (annulled) redirect(`${detail}?anulada=1`);
  return result;
}

/**
 * Envía por email al cliente el borrador o la factura, en PDF. Primero se envía y después se deja constancia
 * (auditoría): un envío fallido no queda registrado como hecho.
 */
export async function sendInvoiceAction(slug: string, taxpayerId: string, invoiceId: string, _previous: ActionResult, data: FormData): Promise<ActionResult> {
  return tenantAction(target(slug, taxpayerId, `${base(slug, taxpayerId)}/${invoiceId}`), async ({ context }) => {
    if (!context.permissions.has("invoices.draft")) return { ok: false, message: "No tienes permiso para hacer esto." };
    const input = parseInvoiceSendInput({ to: data.get("to"), note: data.get("note") });
    if (!input.ok) return invalid(input.errors);
    const db = getDatabase();
    const invoice = await getInvoice(db, context, invoiceId);
    if (invoice === null) return reasonMessage(REASONS, "NOT_FOUND");
    const taxpayer = await getTaxpayer(db, context);
    const title = documentTitle(invoice);
    try {
      await getMailer().send(
        documentMessage({
          to: input.value.to,
          senderName: taxpayer.legalName,
          title,
          draft: invoice.status === "DRAFT",
          total: formatAmount(invoice.total),
          note: input.value.note,
          replyTo: taxpayer.email,
          pdf: { filename: pdfFilename(invoice), content: await invoicePdf(invoice, taxpayer, await getTaxpayerLogo(db, context)) },
        }),
      );
    } catch {
      return { ok: false, message: "No hemos podido enviar el email. Inténtalo de nuevo en unos minutos." };
    }
    const recorded = await recordInvoiceSent(db, context, invoiceId, input.value.to);
    return recorded.ok ? { ok: true, message: `${title} enviado a ${input.value.to}.` } : reasonMessage(REASONS, recorded.reason);
  });
}
