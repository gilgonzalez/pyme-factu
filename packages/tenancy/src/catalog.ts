// Clientes y productos de un contribuyente (datos maestros para facturar).
import { randomUUID } from "node:crypto";
import type { Database } from "@facturalibre/database";
import { nifErrorMessage, parseNif } from "@facturalibre/domain";
import { parseDecimal, parseTaxCategory, SCALE, taxCategoryKey } from "@facturalibre/fiscal-core";
import type { Permission } from "@facturalibre/security";
import { databaseErrorCode } from "./database-errors";
import { AuthorizationError, runInTenant } from "./run-in-tenant";
import type { TenantContext } from "./tenant-context";
import { parseTaxpayerDetails } from "./validation";

type Raw = Readonly<Record<string, unknown>>;
type Invalid = { readonly ok: false; readonly reason: "INVALID"; readonly errors: Readonly<Record<string, string>> };

/** Contribuyente activo del contexto; sin él no hay operaciones fiscales. */
export function activeTaxpayerId(context: TenantContext, permission: Permission): string {
  if (context.taxpayer === null) throw new AuthorizationError(permission);
  return context.taxpayer.id;
}

const blank = (value: unknown): boolean => value === undefined || value === null || (typeof value === "string" && value.trim() === "");

// ─── Clientes ────────────────────────────────────────────────────────────────

/** NIF opcional del cliente: vacío → null; si se escribe, debe ser válido. */
function optionalNif(raw: unknown): { readonly nif: string | null } | { readonly error: string } {
  if (blank(raw)) return { nif: null };
  const parsed = parseNif(raw);
  return parsed.ok ? { nif: parsed.value.nif } : { error: nifErrorMessage(parsed.error) };
}

const checked = (value: unknown): boolean => value === "on" || value === true;

function parseCustomer(raw: Raw) {
  const nif = optionalNif(raw["nif"]);
  const details = parseTaxpayerDetails(raw);
  if ("error" in nif || !details.ok) {
    return { ok: false as const, errors: { ...("error" in nif ? { nif: nif.error } : {}), ...(details.ok ? {} : details.errors) } };
  }
  const { legalName, addressLine, postalCode, city, province, email } = details.value;
  return {
    ok: true as const,
    value: { legalName, addressLine, postalCode, city, province, email, nif: nif.nif, equivalenceSurcharge: checked(raw["equivalenceSurcharge"]) },
  };
}

export type CreateCustomerResult =
  | { readonly ok: true; readonly customer: Pick<CustomerSummary, "id" | "legalName" | "nif" | "equivalenceSurcharge"> }
  | Invalid
  | { readonly ok: false; readonly reason: "NIF_TAKEN" };

export async function createCustomer(db: Database, context: TenantContext, raw: Raw): Promise<CreateCustomerResult> {
  try {
    return await runInTenant(db, context, "customers.write", async (tx) => {
      const taxpayerId = activeTaxpayerId(context, "customers.write");
      const parsed = parseCustomer(raw);
      if (!parsed.ok) return { ok: false, reason: "INVALID", errors: parsed.errors };
      const id = randomUUID();
      await tx.customer.createMany({ data: [{ id, tenantId: context.tenant.id, taxpayerId, ...parsed.value }] });
      const { legalName, nif, equivalenceSurcharge } = parsed.value;
      return { ok: true, customer: { id, legalName, nif, equivalenceSurcharge } };
    });
  } catch (error) {
    if (databaseErrorCode(error) === "23505") return { ok: false, reason: "NIF_TAKEN" };
    throw error;
  }
}

export interface CustomerSummary {
  readonly id: string;
  readonly nif: string | null;
  readonly legalName: string;
  readonly city: string | null;
  readonly equivalenceSurcharge: boolean;
}

export function listCustomers(db: Database, context: TenantContext): Promise<CustomerSummary[]> {
  return runInTenant(db, context, "customers.read", (tx) =>
    tx.customer.findMany({
      where: { taxpayerId: activeTaxpayerId(context, "customers.read") },
      select: { id: true, nif: true, legalName: true, city: true, equivalenceSurcharge: true },
      orderBy: { legalName: "asc" },
    }),
  );
}

// ─── Productos ───────────────────────────────────────────────────────────────

const PRODUCT_NAME_MAX = 200;

function parseProduct(raw: Raw) {
  const name = typeof raw["name"] === "string" ? raw["name"].trim() : "";
  const unitPrice = parseDecimal(raw["unitPrice"], SCALE.unitPrice);
  const tax = parseTaxCategory(raw["tax"]);
  const candidates: [string, string | undefined][] = [
    ["name", name === "" || name.length > PRODUCT_NAME_MAX ? `Escribe un nombre de hasta ${PRODUCT_NAME_MAX} caracteres.` : undefined],
    ["unitPrice", unitPrice.ok ? undefined : "Escribe un precio de 0 o más, con hasta 4 decimales."],
    ["tax", tax === null ? "Elige un tipo de IVA." : undefined],
  ];
  const errors = Object.fromEntries(candidates.filter((entry): entry is [string, string] => entry[1] !== undefined));
  if (!unitPrice.ok || tax === null || Object.keys(errors).length > 0) return { ok: false as const, errors };
  return { ok: true as const, value: { name, unitPrice: unitPrice.value, taxKey: taxCategoryKey(tax) } };
}

export async function createProduct(db: Database, context: TenantContext, raw: Raw): Promise<{ readonly ok: true; readonly product: ProductSummary } | Invalid> {
  return runInTenant(db, context, "products.write", async (tx) => {
    const taxpayerId = activeTaxpayerId(context, "products.write");
    const parsed = parseProduct(raw);
    if (!parsed.ok) return { ok: false, reason: "INVALID", errors: parsed.errors };
    const id = randomUUID();
    await tx.product.createMany({ data: [{ id, tenantId: context.tenant.id, taxpayerId, ...parsed.value }] });
    const { name, unitPrice, taxKey } = parsed.value;
    return { ok: true, product: { id, name, unitPrice, taxKey } };
  });
}

export interface ProductSummary {
  readonly id: string;
  readonly name: string;
  /** Diezmilésimas de euro. */
  readonly unitPrice: bigint;
  readonly taxKey: string;
}

export function listProducts(db: Database, context: TenantContext): Promise<ProductSummary[]> {
  return runInTenant(db, context, "products.read", (tx) =>
    tx.product.findMany({
      where: { taxpayerId: activeTaxpayerId(context, "products.read"), active: true },
      select: { id: true, name: true, unitPrice: true, taxKey: true },
      orderBy: { name: "asc" },
    }),
  );
}
