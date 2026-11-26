import "server-only";
import { formatAmount, formatDecimal, SCALE } from "@facturalibre/fiscal-core";
import { renderInvoicePdf, type InvoicePdfData, type PdfAmount } from "@facturalibre/invoice-pdf";
import type { InvoiceDetail, TaxpayerRecord } from "@facturalibre/tenancy";
import { qrPng, qrUrl } from "@facturalibre/verifactu";
import { partyFrom, spanishDate, type Party } from "@/lib/invoice-view";
import { rectificationLabel, taxLabel } from "@/lib/invoicing";
import { qrEnvironment } from "./verifactu";

const percent = (scaled: bigint): string => `${formatDecimal(scaled, SCALE.percent)} %`;
const pdfParty = (party: Party) => ({ name: party.legalName, nif: party.nif, address: party.address });

/** Desglose por tipo y totales, como en la ficha de la factura. */
function amountsOf(invoice: InvoiceDetail): PdfAmount[] {
  const breakdown = invoice.breakdown.flatMap((entry): PdfAmount[] => [
    { label: `${taxLabel(entry.key)} sobre ${formatAmount(entry.base)}`, value: formatAmount(entry.quota) },
    ...(entry.surchargeQuota === 0n ? [] : [{ label: `Recargo de equivalencia ${percent(entry.surchargePercent)}`, value: formatAmount(entry.surchargeQuota) }]),
  ]);
  return [
    ...breakdown,
    { label: "Base imponible", value: formatAmount(invoice.taxableBase) },
    { label: "IVA", value: formatAmount(invoice.vatTotal) },
    ...(invoice.surchargeTotal === 0n ? [] : [{ label: "Recargo de equivalencia", value: formatAmount(invoice.surchargeTotal) }]),
    ...(invoice.withholdingAmount === 0n ? [] : [{ label: `Retención IRPF (${percent(invoice.withholdingPercent)})`, value: `−${formatAmount(invoice.withholdingAmount)}` }]),
    { label: "Total", value: formatAmount(invoice.total), strong: true },
  ];
}

/** Hoy en España, "2026-11-26" (la fecha que lleva un borrador). */
const todayInSpain = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });

/** «Borrador de factura», «Factura F2026-0001», «Factura rectificativa R2026-0001»… */
export function documentTitle(invoice: Pick<InvoiceDetail, "kind" | "status" | "number">): string {
  const kind = invoice.kind === "RECTIFYING" ? "factura rectificativa" : "factura";
  return invoice.status === "DRAFT" || invoice.number === null ? `Borrador de ${kind}` : `${kind.charAt(0).toUpperCase()}${kind.slice(1)} ${invoice.number}`;
}

/** Nombre del fichero PDF: el número de la factura, o «borrador-» y el principio del id. */
export const pdfFilename = (invoice: Pick<InvoiceDetail, "id" | "status" | "number">): string =>
  invoice.status === "DRAFT" || invoice.number === null ? `borrador-${invoice.id.slice(-8)}.pdf` : `${invoice.number}.pdf`;

async function verifactuOf(invoice: InvoiceDetail): Promise<InvoicePdfData["verifactu"]> {
  if (invoice.status === "DRAFT") return null;
  const { alta, anulacion } = invoice.verifactu;
  if (alta === null || anulacion !== null) return null;
  const url = qrUrl(qrEnvironment(), { issuerNif: alta.issuerNif, number: alta.invoiceNumber, issueDate: alta.issueDate }, alta.importeTotal ?? "");
  return { qrPng: await qrPng(url) };
}

/**
 * PDF de una factura emitida, con el QR tributario de su registro de alta (si no está anulada), o de un
 * borrador: con la fecha de hoy, sin número ni QR y marcado como «sin validez fiscal».
 */
export async function invoicePdf(invoice: InvoiceDetail, taxpayer: TaxpayerRecord): Promise<Uint8Array> {
  const issuer = partyFrom(invoice.issuerSnapshot) ?? { legalName: taxpayer.legalName, nif: taxpayer.nif, address: "" };
  const recipient = partyFrom(invoice.customerSnapshot) ?? { legalName: invoice.customerName, nif: null, address: "" };
  return renderInvoicePdf({
    title: documentTitle(invoice),
    issueDate: spanishDate(invoice.issueDate ?? todayInSpain()),
    issuer: pdfParty(issuer),
    recipient: pdfParty(recipient),
    lines: invoice.lines.map((line) => ({
      description: line.description,
      quantity: formatDecimal(line.quantity, SCALE.quantity),
      unitPrice: `${formatDecimal(line.unitPrice, SCALE.unitPrice)} €`,
      discount: line.discountPercent === 0n ? "—" : percent(line.discountPercent),
      tax: taxLabel(line.taxKey),
      base: formatAmount(line.lineBase),
    })),
    amounts: amountsOf(invoice),
    notes: invoice.notes,
    rectification:
      invoice.kind === "RECTIFYING"
        ? `Rectifica la factura ${invoice.rectifiesNumber ?? ""} (${rectificationLabel(invoice.rectificationCode)}). Motivo: ${invoice.rectificationReason ?? ""}`
        : null,
    annulled: invoice.verifactu.anulacion !== null,
    draft: invoice.status === "DRAFT",
    verifactu: await verifactuOf(invoice),
  });
}
