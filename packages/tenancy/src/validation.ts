// Validación de entradas de formularios de equipo (frontera: se parsean UNA vez aquí; dentro se confía).
// Funciones puras con mensajes en español listos para mostrar junto a cada campo.
import { ibanErrorMessage, parseIban } from "@facturalibre/domain";
import { parseDecimal, parseTaxCategory, SCALE, taxCategoryKey } from "@facturalibre/fiscal-core";
import { ROLES, type Role } from "@facturalibre/security";

export type Parsed<T, Field extends string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: Partial<Record<Field, string>> };

/** Mismo formato que la restricción CHECK tenants_slug_format. */
const SLUG = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 120;
const EMAIL_MAX = 254;

/** Primeros segmentos de URL que usa la propia aplicación: no pueden ser el slug de una organización. */
const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "api", "app", "admin", "auth", "entrar", "registro", "salir", "cuenta", "invitacion", "invitaciones",
  "organizaciones", "nueva-organizacion", "recuperar-contrasena", "restablecer-contrasena", "verificar-email",
  "static", "public", "ayuda", "soporte", "legal", "privacidad",
]);

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Propone un slug a partir del nombre: sin tildes, en minúsculas, con guiones y de 3 a 63 caracteres. */
export function suggestSlug(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 63)
    .replace(/^-+|-+$/g, "");
  if (base === "") return "mi-organizacion";
  return base.length < 3 ? `${base}-org` : base;
}

export interface OrganizationInput {
  readonly name: string;
  readonly slug: string;
}

function nameError(name: string): string | undefined {
  if (name === "") return "Escribe el nombre de la organización.";
  if (name.length > NAME_MAX) return `El nombre no puede superar los ${NAME_MAX} caracteres.`;
  return undefined;
}

function slugError(slug: string): string | undefined {
  if (!SLUG.test(slug)) return "Usa de 3 a 63 letras minúsculas, números o guiones, sin guion al principio ni al final.";
  if (RESERVED_SLUGS.has(slug)) return "Esa dirección está reservada. Elige otra.";
  return undefined;
}

function collect<Field extends string>(errors: Record<Field, string | undefined>): Partial<Record<Field, string>> | null {
  const present = Object.entries(errors).filter((entry): entry is [Field, string] => entry[1] !== undefined);
  return present.length === 0 ? null : (Object.fromEntries(present) as Partial<Record<Field, string>>);
}

export function parseOrganizationInput(raw: { readonly name?: unknown; readonly slug?: unknown }): Parsed<OrganizationInput, "name" | "slug"> {
  const name = text(raw.name);
  const slug = text(raw.slug);
  const errors = collect({ name: nameError(name), slug: slugError(slug) });
  return errors === null ? { ok: true, value: { name, slug } } : { ok: false, errors };
}

export type InvitableRole = Exclude<Role, "OWNER">;
export type TaxpayerScope = "ALL_TAXPAYERS" | "ASSIGNED_TAXPAYERS";

export interface InvitationInput {
  readonly email: string;
  readonly role: InvitableRole;
  readonly taxpayerScope: TaxpayerScope;
}

const isRole = (value: string): value is Role => (ROLES as readonly string[]).includes(value);

function roleError(role: string): string | undefined {
  if (role === "OWNER") return "La propiedad no se invita: se transfiere desde Equipo.";
  return isRole(role) ? undefined : "Elige un rol.";
}

const emailError = (email: string): string | undefined =>
  EMAIL.test(email) && email.length <= EMAIL_MAX ? undefined : "Escribe un email válido.";

export function parseInvitationInput(raw: {
  readonly email?: unknown;
  readonly role?: unknown;
  readonly taxpayerScope?: unknown;
}): Parsed<InvitationInput, "email" | "role"> {
  const email = text(raw.email).toLowerCase();
  const role = text(raw.role);
  const errors = collect({ email: emailError(email), role: roleError(role) });
  if (errors !== null) return { ok: false, errors };
  const taxpayerScope: TaxpayerScope = raw.taxpayerScope === "ASSIGNED_TAXPAYERS" ? "ASSIGNED_TAXPAYERS" : "ALL_TAXPAYERS";
  return { ok: true, value: { email, role: role as InvitableRole, taxpayerScope } };
}

// ─── Envío de borradores y facturas ──────────────────────────────────────────

const NOTE_MAX = 2000;

export interface InvoiceSendInput {
  readonly to: string;
  /** Mensaje para el cliente; null si no se escribe nada. */
  readonly note: string | null;
}

export function parseInvoiceSendInput(raw: { readonly to?: unknown; readonly note?: unknown }): Parsed<InvoiceSendInput, "to" | "note"> {
  const to = text(raw.to).toLowerCase();
  const note = text(raw.note);
  const errors = collect({ to: emailError(to), note: note.length > NOTE_MAX ? `El mensaje puede tener como mucho ${String(NOTE_MAX)} caracteres.` : undefined });
  if (errors !== null) return { ok: false, errors };
  return { ok: true, value: { to, note: note === "" ? null : note } };
}

// ─── Contribuyentes ──────────────────────────────────────────────────────────

/** Datos editables de un contribuyente (el NIF y el tipo de persona son su identidad: no se editan). */
export interface TaxpayerDetails {
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly addressLine: string | null;
  readonly postalCode: string | null;
  readonly city: string | null;
  readonly province: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly website: string | null;
  /** Datos de inscripción en el Registro Mercantil (sociedades). */
  readonly registryInfo: string | null;
}

export type TaxpayerField = keyof TaxpayerDetails | "nif";

/** Código postal español: 5 cifras y provincia 01–52. */
const POSTAL_CODE = /^(0[1-9]|[1-4]\d|5[0-2])\d{3}$/;
const LIMITS = {
  legalName: 120,
  tradeName: 120,
  addressLine: 200,
  city: 100,
  province: 100,
  registryInfo: 300,
  paymentInstructions: 500,
  footerNote: 1000,
  emailMessage: 2000,
} as const;
const PHONE = /^\+?[\d\s().-]{6,30}$/;
const WEBSITE = /^(https?:\/\/)?[^\s/.]+(\.[^\s/.]+)+(\/\S*)?$/i;
const WEBSITE_MAX = 200;

const optional = (value: unknown): string | null => {
  const trimmed = text(value);
  return trimmed === "" ? null : trimmed;
};

function lengthError(field: keyof typeof LIMITS, value: string | null): string | undefined {
  return value !== null && value.length > LIMITS[field] ? `No puede superar los ${LIMITS[field]} caracteres.` : undefined;
}

export function parseTaxpayerDetails(raw: Readonly<Record<string, unknown>>): Parsed<TaxpayerDetails, TaxpayerField> {
  const details: TaxpayerDetails = {
    legalName: text(raw["legalName"]),
    tradeName: optional(raw["tradeName"]),
    addressLine: optional(raw["addressLine"]),
    postalCode: optional(raw["postalCode"]),
    city: optional(raw["city"]),
    province: optional(raw["province"]),
    email: optional(raw["email"])?.toLowerCase() ?? null,
    phone: optional(raw["phone"]),
    website: optional(raw["website"]),
    registryInfo: optional(raw["registryInfo"]),
  };
  const errors = collect<TaxpayerField>({
    nif: undefined,
    legalName: details.legalName === "" ? "Escribe el nombre y apellidos o la razón social." : lengthError("legalName", details.legalName),
    tradeName: lengthError("tradeName", details.tradeName),
    addressLine: lengthError("addressLine", details.addressLine),
    postalCode: details.postalCode === null || POSTAL_CODE.test(details.postalCode) ? undefined : "Escribe un código postal español de 5 cifras.",
    city: lengthError("city", details.city),
    province: lengthError("province", details.province),
    email: details.email === null ? undefined : emailError(details.email),
    phone: details.phone === null || PHONE.test(details.phone) ? undefined : "Escribe solo cifras, espacios y, si quieres, el prefijo (+34).",
    website:
      details.website === null || (WEBSITE.test(details.website) && details.website.length <= WEBSITE_MAX)
        ? undefined
        : "Escribe una dirección web, por ejemplo www.tuempresa.es.",
    registryInfo: lengthError("registryInfo", details.registryInfo),
  });
  return errors === null ? { ok: true, value: details } : { ok: false, errors };
}

// ─── Configuración de facturación del contribuyente ─────────────────────────

/** Cobro y valores por defecto que se usan en borradores, facturas y envíos por email. Todo opcional. */
export interface BillingSettings {
  /** IBAN normalizado (sin espacios, en mayúsculas). */
  readonly iban: string | null;
  readonly paymentInstructions: string | null;
  /** Días desde la expedición hasta el vencimiento. */
  readonly paymentTermsDays: number | null;
  /** Retención de IRPF por defecto, escala 2 (1500 = 15 %). */
  readonly defaultWithholdingPercent: number | null;
  readonly defaultTaxKey: string | null;
  readonly footerNote: string | null;
  readonly emailMessage: string | null;
}

export type BillingSettingsField = keyof BillingSettings;

const TERMS_MAX = 3650;
const HUNDRED_PERCENT = 10_000n;

type Converted<T> = { readonly value: T | null; readonly error?: string };

function termsOf(raw: string | null): Converted<number> {
  if (raw === null) return { value: null };
  const days = /^\d{1,4}$/.test(raw) ? Number(raw) : Number.NaN;
  return days <= TERMS_MAX ? { value: days } : { value: null, error: `Escribe un número de días entre 0 y ${String(TERMS_MAX)}.` };
}

function withholdingOf(raw: string | null): Converted<number> {
  if (raw === null) return { value: null };
  const parsed = parseDecimal(raw, SCALE.percent);
  return parsed.ok && parsed.value <= HUNDRED_PERCENT
    ? { value: Number(parsed.value) }
    : { value: null, error: "Escribe un porcentaje entre 0 y 100, con hasta 2 decimales." };
}

function taxKeyOf(raw: string | null): Converted<string> {
  if (raw === null) return { value: null };
  const tax = parseTaxCategory(raw);
  return tax === null ? { value: null, error: "Elige un tipo de IVA." } : { value: taxCategoryKey(tax) };
}

function ibanOf(raw: string | null): Converted<string> {
  if (raw === null) return { value: null };
  const parsed = parseIban(raw);
  return parsed.ok ? { value: parsed.value } : { value: null, error: ibanErrorMessage(parsed.error) };
}

export function parseBillingSettings(raw: Readonly<Record<string, unknown>>): Parsed<BillingSettings, BillingSettingsField> {
  const iban = ibanOf(optional(raw["iban"]));
  const terms = termsOf(optional(raw["paymentTermsDays"]));
  const withholding = withholdingOf(optional(raw["defaultWithholdingPercent"]));
  const tax = taxKeyOf(optional(raw["defaultTaxKey"]));
  const value: BillingSettings = {
    iban: iban.value,
    paymentInstructions: optional(raw["paymentInstructions"]),
    paymentTermsDays: terms.value,
    defaultWithholdingPercent: withholding.value,
    defaultTaxKey: tax.value,
    footerNote: optional(raw["footerNote"]),
    emailMessage: optional(raw["emailMessage"]),
  };
  const errors = collect<BillingSettingsField>({
    iban: iban.error,
    paymentInstructions: lengthError("paymentInstructions", value.paymentInstructions),
    paymentTermsDays: terms.error,
    defaultWithholdingPercent: withholding.error,
    defaultTaxKey: tax.error,
    footerNote: lengthError("footerNote", value.footerNote),
    emailMessage: lengthError("emailMessage", value.emailMessage),
  });
  return errors === null ? { ok: true, value } : { ok: false, errors };
}

// ─── Logo ────────────────────────────────────────────────────────────────────

export const LOGO_MAX_BYTES = 512 * 1024;

export interface Logo {
  readonly bytes: Uint8Array;
  readonly mimeType: "image/png" | "image/jpeg";
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const startsWith = (bytes: Uint8Array, signature: readonly number[]): boolean => signature.every((byte, index) => bytes[index] === byte);

/** Logo PNG o JPEG de hasta 512 KB, reconocido por su contenido (no por el nombre ni el tipo que diga el navegador). */
export function parseLogo(bytes: Uint8Array): { readonly ok: true; readonly value: Logo } | { readonly ok: false; readonly error: string } {
  if (bytes.length === 0) return { ok: false, error: "Elige una imagen PNG o JPEG." };
  if (bytes.length > LOGO_MAX_BYTES) return { ok: false, error: "El logo no puede ocupar más de 512 KB." };
  if (startsWith(bytes, PNG_SIGNATURE)) return { ok: true, value: { bytes, mimeType: "image/png" } };
  if (startsWith(bytes, JPEG_SIGNATURE)) return { ok: true, value: { bytes, mimeType: "image/jpeg" } };
  return { ok: false, error: "El logo tiene que ser una imagen PNG o JPEG." };
}
