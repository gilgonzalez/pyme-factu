"use server";
// Alta de clientes y productos del contribuyente activo: desde sus pantallas o desde el editor de facturas.
import { formatDecimal, SCALE } from "@facturalibre/fiscal-core";
import { createCustomer, createProduct } from "@facturalibre/tenancy";
import type { ActionResult } from "@/components/action-form";
import { getDatabase } from "@/lib/server/db";
import { reasonMessage, tenantAction } from "@/lib/server/tenant-action";

const REASONS: Readonly<Record<string, string>> = { NIF_TAKEN: "Ya tienes un cliente con ese NIF." };

const target = (slug: string, taxpayerId: string, section: string) => ({
  slug,
  taxpayerId,
  returnPath: `/${slug}/contribuyentes/${taxpayerId}/${section}`,
});

export async function createCustomerAction(slug: string, taxpayerId: string, _previous: ActionResult, data: FormData): Promise<ActionResult> {
  return tenantAction(target(slug, taxpayerId, "clientes"), async ({ context }) => {
    const result = await createCustomer(getDatabase(), context, Object.fromEntries(data));
    if (result.ok) return { ok: true, message: `Cliente «${result.customer.legalName}» dado de alta.` };
    return result.reason === "INVALID" ? { ok: false, message: "", errors: result.errors } : reasonMessage(REASONS, result.reason);
  });
}

export async function createProductAction(slug: string, taxpayerId: string, _previous: ActionResult, data: FormData): Promise<ActionResult> {
  return tenantAction(target(slug, taxpayerId, "productos"), async ({ context }) => {
    const result = await createProduct(getDatabase(), context, Object.fromEntries(data));
    return result.ok ? { ok: true, message: "Producto guardado." } : { ok: false, message: "", errors: result.errors };
  });
}

/** Resultado de un alta desde el editor de facturas: el elemento creado, listo para elegirlo. */
export type CreatedResult<Item> =
  | { readonly ok: true; readonly message: string; readonly item: Item }
  | { readonly ok: false; readonly message: string; readonly errors?: Readonly<Record<string, string>> };

export interface CreatedCustomer {
  readonly id: string;
  readonly legalName: string;
  readonly nif: string | null;
  readonly equivalenceSurcharge: boolean;
}

export interface CreatedProduct {
  readonly id: string;
  readonly name: string;
  /** Precio ya formateado ("35,5"). */
  readonly unitPrice: string;
  readonly taxKey: string;
}

/** Alta de un cliente sin salir de la factura. */
export async function createCustomerFromEditorAction(slug: string, taxpayerId: string, data: FormData): Promise<CreatedResult<CreatedCustomer>> {
  return tenantAction(target(slug, taxpayerId, "facturas/nueva"), async ({ context }): Promise<CreatedResult<CreatedCustomer>> => {
    const result = await createCustomer(getDatabase(), context, Object.fromEntries(data));
    if (result.ok) return { ok: true, message: "", item: result.customer };
    return result.reason === "INVALID" ? { ok: false, message: "", errors: result.errors } : { ok: false, message: REASONS[result.reason] ?? "" };
  });
}

/** Alta de un producto sin salir de la factura. */
export async function createProductFromEditorAction(slug: string, taxpayerId: string, data: FormData): Promise<CreatedResult<CreatedProduct>> {
  return tenantAction(target(slug, taxpayerId, "facturas/nueva"), async ({ context }): Promise<CreatedResult<CreatedProduct>> => {
    const result = await createProduct(getDatabase(), context, Object.fromEntries(data));
    if (!result.ok) return { ok: false, message: "", errors: result.errors };
    const { id, name, unitPrice, taxKey } = result.product;
    return { ok: true, message: "", item: { id, name, taxKey, unitPrice: formatDecimal(unitPrice, SCALE.unitPrice) } };
  });
}
