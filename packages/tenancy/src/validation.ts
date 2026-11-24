// Validación de entradas de formularios de equipo (frontera: se parsean UNA vez aquí; dentro se confía).
// Funciones puras con mensajes en español listos para mostrar junto a cada campo.
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
}

export type TaxpayerField = keyof TaxpayerDetails | "nif";

/** Código postal español: 5 cifras y provincia 01–52. */
const POSTAL_CODE = /^(0[1-9]|[1-4]\d|5[0-2])\d{3}$/;
const LIMITS = { legalName: 120, tradeName: 120, addressLine: 200, city: 100, province: 100 } as const;

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
  });
  return errors === null ? { ok: true, value: details } : { ok: false, errors };
}
