// Piezas de facturación compartidas por invoices.ts (borradores, emisión, consulta), templates.ts (plantillas) y
// verifactu.ts (registros).
import type { Tx } from "@facturalibre/database";
import {
  calculateInvoice,
  parseDecimal,
  parseInvoiceLine,
  parseTaxCategory,
  SCALE,
  type InvoiceTotals,
  type ParsedLine,
  type TaxCategory,
} from "@facturalibre/fiscal-core";

export type Kind = "STANDARD" | "RECTIFYING";

export type Invalid = { readonly ok: false; readonly reason: "INVALID"; readonly errors: Readonly<Record<string, string>> };

// ─── Entrada de borradores y plantillas: mismas reglas en ambos ──────────────

const HUNDRED_PERCENT = 10_000n;
const NOTES_MAX = 1000;

/** Líneas del formulario; los errores se anotan por campo («lines.1.quantity»). */
export function parseLines(raw: unknown, errors: Record<string, string>): ParsedLine[] {
  const rows: unknown[] = Array.isArray(raw) ? raw : [];
  if (rows.length === 0) errors["lines"] = "Añade al menos una línea.";
  const lines: ParsedLine[] = [];
  rows.forEach((row, index) => {
    const parsed = parseInvoiceLine(typeof row === "object" && row !== null ? row : {});
    if (parsed.ok) lines.push(parsed.value);
    else for (const [field, message] of Object.entries(parsed.errors)) errors[`lines.${String(index)}.${field}`] = message;
  });
  return lines;
}

export function parseWithholding(raw: unknown, errors: Record<string, string>): bigint {
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) return 0n;
  const parsed = parseDecimal(raw, SCALE.percent);
  if (parsed.ok && parsed.value <= HUNDRED_PERCENT) return parsed.value;
  errors["withholdingPercent"] = "La retención debe estar entre 0 y 100 %.";
  return 0n;
}

export function parseNotes(raw: unknown, errors: Record<string, string>): string | null {
  const notes = typeof raw === "string" ? raw.trim() : "";
  if (notes.length > NOTES_MAX) errors["notes"] = `Las observaciones no pueden superar los ${String(NOTES_MAX)} caracteres.`;
  return notes === "" ? null : notes;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "F2026" + 7 → "F2026-0007". */
export const formatInvoiceNumber = (seriesCode: string, number: number): string => `${seriesCode}-${String(number).padStart(4, "0")}`;

/** Fecha de una columna DATE → "AAAA-MM-DD". */
export const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/** Categoría guardada; la BD solo admite claves válidas (CHECK), así que el respaldo es inalcanzable. */
const storedTax = (taxKey: string): TaxCategory => parseTaxCategory(taxKey) ?? { kind: "EXEMPT", cause: null };

interface StoredLine {
  readonly quantity: bigint;
  readonly unitPrice: bigint;
  readonly discountPercent: number | bigint;
  readonly taxKey: string;
}

/** Totales y desglose de unas líneas guardadas, con el mismo cálculo que al guardarlas (fiscal-core). */
export const totalsOfStored = (lines: readonly StoredLine[], equivalenceSurcharge: boolean, withholdingPercent: number): InvoiceTotals =>
  calculateInvoice({
    lines: lines.map((line) => ({ quantity: line.quantity, unitPrice: line.unitPrice, discountPercent: BigInt(line.discountPercent), tax: storedTax(line.taxKey) })),
    equivalenceSurcharge,
    withholdingPercent: BigInt(withholdingPercent),
  });

/** Bloquea la factura (FOR UPDATE) y devuelve su estado, o null si no existe o no se ve. */
export async function lockInvoice(tx: Tx, taxpayerId: string, invoiceId: string): Promise<{ status: string; kind: Kind } | null> {
  if (!UUID.test(invoiceId)) return null;
  const [row] = await tx.$queryRaw<{ status: string; kind: Kind }[]>`
    SELECT status::text, kind::text AS kind FROM invoices WHERE id = ${invoiceId}::uuid AND taxpayer_id = ${taxpayerId}::uuid FOR UPDATE`;
  return row ?? null;
}
