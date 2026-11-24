import "server-only";
import { formatDecimal, SCALE } from "@facturalibre/fiscal-core";
import { listCustomers, listProducts, type TenantContext } from "@facturalibre/tenancy";
import { getDatabase } from "@/lib/server/db";
import type { EditorCustomer, EditorProduct } from "./invoice-editor";

/** Clientes y productos del contribuyente activo, ya serializables para el editor (sin bigint). */
export async function editorData(context: TenantContext): Promise<{ customers: EditorCustomer[]; products: EditorProduct[] }> {
  const db = getDatabase();
  const [customers, products] = await Promise.all([listCustomers(db, context), listProducts(db, context)]);
  return {
    customers: customers.map(({ id, legalName, nif, equivalenceSurcharge }) => ({ id, legalName, nif, equivalenceSurcharge })),
    products: products.map(({ id, name, unitPrice, taxKey }) => ({ id, name, taxKey, unitPrice: formatDecimal(unitPrice, SCALE.unitPrice) })),
  };
}

/** Rutas de la sección Facturas de un contribuyente. */
export const invoicesPath = (slug: string, taxpayerId: string): string => `/${slug}/contribuyentes/${taxpayerId}/facturas`;
