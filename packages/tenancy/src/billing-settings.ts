// Configuración de facturación del contribuyente ACTIVO: cobro (IBAN, instrucciones, plazo), valores por defecto
// de las facturas, pie, mensaje de los envíos y logo. Leer: taxpayers.read; cambiar: taxpayers.update (acceso FULL).
// El perfil del emisor (datos fiscales + cobro) es lo que se imprime en borradores y se congela al emitir.
import type { Database, Tx } from "@facturalibre/database";
import { recordAudit } from "./audit";
import { AuthorizationError, runInTenant } from "./run-in-tenant";
import type { TenantContext } from "./tenant-context";
import { parseBillingSettings, parseLogo, type BillingSettings, type BillingSettingsField, type Logo } from "./validation";

type Invalid<Field extends string> = { readonly ok: false; readonly reason: "INVALID"; readonly errors: Partial<Record<Field, string>> };

export interface BillingSettingsView extends BillingSettings {
  readonly hasLogo: boolean;
  /** Cambia cada vez que se guarda la configuración (para pedir de nuevo la vista previa del logo); null sin logo. */
  readonly logoVersion: string | null;
}

function activeTaxpayer(context: TenantContext, permission: "taxpayers.read" | "taxpayers.update"): string {
  if (context.taxpayer === null) throw new AuthorizationError(permission);
  return context.taxpayer.id;
}

const SETTINGS_SELECT = {
  iban: true,
  paymentInstructions: true,
  defaultPaymentTermsDays: true,
  defaultWithholdingPercent: true,
  defaultTaxKey: true,
  invoiceFooterNote: true,
  emailMessage: true,
  logoMimeType: true,
  updatedAt: true,
} as const;

/** Configuración tal como está guardada (sin fila: todo vacío). */
export async function readBillingSettings(tx: Tx, taxpayerId: string): Promise<BillingSettingsView> {
  const row = await tx.taxpayerSettings.findFirst({ where: { taxpayerId }, select: SETTINGS_SELECT });
  return {
    iban: row?.iban ?? null,
    paymentInstructions: row?.paymentInstructions ?? null,
    paymentTermsDays: row?.defaultPaymentTermsDays ?? null,
    defaultWithholdingPercent: row?.defaultWithholdingPercent ?? null,
    defaultTaxKey: row?.defaultTaxKey ?? null,
    footerNote: row?.invoiceFooterNote ?? null,
    emailMessage: row?.emailMessage ?? null,
    hasLogo: row?.logoMimeType != null,
    logoVersion: row?.logoMimeType == null ? null : String(row.updatedAt.getTime()),
  };
}

export function getBillingSettings(db: Database, context: TenantContext): Promise<BillingSettingsView> {
  return runInTenant(db, context, "taxpayers.read", (tx) => readBillingSettings(tx, activeTaxpayer(context, "taxpayers.read")));
}

/** Escribe en la fila de configuración del contribuyente (la crea si un contribuyente antiguo no la tuviera). */
async function writeSettings(tx: Tx, context: TenantContext, taxpayerId: string, data: Record<string, unknown>): Promise<void> {
  const { count } = await tx.taxpayerSettings.updateMany({ where: { taxpayerId }, data });
  if (count === 0) await tx.taxpayerSettings.createMany({ data: [{ taxpayerId, tenantId: context.tenant.id, ...data }] });
}

/** Guarda TODA la configuración de facturación (un campo vacío se borra). */
export function updateBillingSettings(
  db: Database,
  context: TenantContext,
  raw: Readonly<Record<string, unknown>>,
): Promise<{ readonly ok: true } | Invalid<BillingSettingsField>> {
  return runInTenant(db, context, "taxpayers.update", async (tx) => {
    const taxpayerId = activeTaxpayer(context, "taxpayers.update");
    const parsed = parseBillingSettings(raw);
    if (!parsed.ok) return { ok: false, reason: "INVALID", errors: parsed.errors };
    const { paymentTermsDays, footerNote, ...rest } = parsed.value;
    await writeSettings(tx, context, taxpayerId, { ...rest, defaultPaymentTermsDays: paymentTermsDays, invoiceFooterNote: footerNote });
    await recordAudit(tx, context, "taxpayer.settings_updated", { type: "taxpayer", id: taxpayerId });
    return { ok: true };
  });
}

// ─── Logo ────────────────────────────────────────────────────────────────────

export async function readLogo(tx: Tx, taxpayerId: string): Promise<Logo | null> {
  const row = await tx.taxpayerSettings.findFirst({ where: { taxpayerId }, select: { logo: true, logoMimeType: true } });
  if (row?.logo == null || (row.logoMimeType !== "image/png" && row.logoMimeType !== "image/jpeg")) return null;
  return { bytes: new Uint8Array(row.logo), mimeType: row.logoMimeType };
}

export function getTaxpayerLogo(db: Database, context: TenantContext): Promise<Logo | null> {
  return runInTenant(db, context, "taxpayers.read", (tx) => readLogo(tx, activeTaxpayer(context, "taxpayers.read")));
}

export function setTaxpayerLogo(db: Database, context: TenantContext, bytes: Uint8Array): Promise<{ readonly ok: true } | Invalid<"logo">> {
  return runInTenant(db, context, "taxpayers.update", async (tx) => {
    const taxpayerId = activeTaxpayer(context, "taxpayers.update");
    const parsed = parseLogo(bytes);
    if (!parsed.ok) return { ok: false, reason: "INVALID", errors: { logo: parsed.error } };
    await writeSettings(tx, context, taxpayerId, { logo: Buffer.from(parsed.value.bytes), logoMimeType: parsed.value.mimeType });
    await recordAudit(tx, context, "taxpayer.logo_updated", { type: "taxpayer", id: taxpayerId }, { change: "set" });
    return { ok: true };
  });
}

export function deleteTaxpayerLogo(db: Database, context: TenantContext): Promise<{ readonly ok: true }> {
  return runInTenant(db, context, "taxpayers.update", async (tx) => {
    const taxpayerId = activeTaxpayer(context, "taxpayers.update");
    await writeSettings(tx, context, taxpayerId, { logo: null, logoMimeType: null });
    await recordAudit(tx, context, "taxpayer.logo_updated", { type: "taxpayer", id: taxpayerId }, { change: "deleted" });
    return { ok: true };
  });
}

// ─── Perfil del emisor ───────────────────────────────────────────────────────

/** Lo que se imprime del emisor en un borrador o una factura: datos fiscales, contacto y cobro. */
export interface IssuerProfile {
  readonly nif: string;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly addressLine: string | null;
  readonly postalCode: string | null;
  readonly city: string | null;
  readonly province: string | null;
  readonly countryCode: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly registryInfo: string | null;
  readonly iban: string | null;
  readonly paymentInstructions: string | null;
  readonly footerNote: string | null;
}

const ISSUER_FIELDS = {
  nif: true,
  legalName: true,
  tradeName: true,
  addressLine: true,
  postalCode: true,
  city: true,
  province: true,
  countryCode: true,
  email: true,
  phone: true,
  website: true,
  registryInfo: true,
} as const;

/** Perfil del emisor AHORA (se congela al emitir) y el plazo de pago con el que se calcula el vencimiento. */
export async function issuerProfile(tx: Tx, taxpayerId: string): Promise<{ readonly profile: IssuerProfile; readonly paymentTermsDays: number | null }> {
  const taxpayer = await tx.taxpayer.findFirstOrThrow({ where: { id: taxpayerId }, select: ISSUER_FIELDS });
  const settings = await readBillingSettings(tx, taxpayerId);
  return {
    profile: { ...taxpayer, iban: settings.iban, paymentInstructions: settings.paymentInstructions, footerNote: settings.footerNote },
    paymentTermsDays: settings.paymentTermsDays,
  };
}

/** "2026-11-26" + 30 → "2026-12-26". */
export const addDays = (isoDate: string, days: number): string => new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
