"use server";
// Alta de clientes y productos del contribuyente activo.
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
