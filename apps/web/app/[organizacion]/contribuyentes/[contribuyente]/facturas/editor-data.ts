import "server-only";
import { formatDecimal, SCALE } from "@facturalibre/fiscal-core";
import { listCustomers, listProducts, type TenantContext } from "@facturalibre/tenancy";
import { getDatabase } from "@/lib/server/db";
import type { EditorCustomer, EditorProduct, InvoiceEditorProps } from "./invoice-editor";

/** Clientes y productos del contribuyente activo, ya serializables para el editor (sin bigint). */
export async function editorData(context: TenantContext): Promise<{ customers: EditorCustomer[]; products: EditorProduct[] }> {
  const db = getDatabase();
  const [customers, products] = await Promise.all([listCustomers(db, context), listProducts(db, context)]);
  return {
    customers: customers.map(({ id, legalName, nif, equivalenceSurcharge }) => ({ id, legalName, nif, equivalenceSurcharge })),
    products: products.map(({ id, name, unitPrice, taxKey }) => ({ id, name, taxKey, unitPrice: formatDecimal(unitPrice, SCALE.unitPrice) })),
  };
}

interface StoredContent {
  readonly customerId: string | null;
  readonly withholdingPercent: bigint;
  readonly notes: string | null;
  readonly lines: readonly { readonly description: string; readonly quantity: bigint; readonly unitPrice: bigint; readonly discountPercent: bigint; readonly taxKey: string }[];
}

/** Lo guardado (borrador, factura o plantilla) como valores iniciales del editor, en el formato que se escribe. */
export function editorInitial(stored: StoredContent): InvoiceEditorProps["initial"] {
  return {
    customerId: stored.customerId ?? "",
    withholdingPercent: stored.withholdingPercent === 0n ? "" : formatDecimal(stored.withholdingPercent, SCALE.percent),
    notes: stored.notes ?? "",
    lines: stored.lines.map((line) => ({
      description: line.description,
      quantity: formatDecimal(line.quantity, SCALE.quantity),
      unitPrice: formatDecimal(line.unitPrice, SCALE.unitPrice),
      discountPercent: line.discountPercent === 0n ? "" : formatDecimal(line.discountPercent, SCALE.percent),
      tax: line.taxKey,
    })),
  };
}

/** Rutas de la sección Facturas de un contribuyente. */
export const invoicesPath = (slug: string, taxpayerId: string): string => `/${slug}/contribuyentes/${taxpayerId}/facturas`;
