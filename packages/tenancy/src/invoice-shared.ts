// Piezas de facturación compartidas por invoices.ts (borradores, emisión, consulta) y verifactu.ts (registros).
import type { Tx } from "@facturalibre/database";
import { calculateInvoice, parseTaxCategory, type InvoiceTotals, type TaxCategory } from "@facturalibre/fiscal-core";

export type Kind = "STANDARD" | "RECTIFYING";

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
