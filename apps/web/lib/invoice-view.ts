// Datos de presentación de una factura compartidos por su ficha web y su PDF.
import { capitalizeAddress, formatIban } from "@facturalibre/domain";

export interface Party {
  readonly legalName: string;
  readonly nif: string | null;
  readonly address: string;
}

/** Datos de una parte a partir de la instantánea guardada al emitir (o null si aún es borrador). */
export function partyFrom(snapshot: unknown): Party | null {
  if (typeof snapshot !== "object" || snapshot === null) return null;
  const data = snapshot as Record<string, unknown>;
  const text = (key: string): string | null => (typeof data[key] === "string" ? data[key] : null);
  // Dirección, municipio y provincia con su capitalización («calle de la paz» → «Calle de la Paz»).
  const place = (key: string): string | null => {
    const value = text(key);
    return value === null ? null : capitalizeAddress(value);
  };
  const address = [place("addressLine"), [text("postalCode"), place("city")].filter(Boolean).join(" "), place("province")].filter(Boolean).join(", ");
  return { legalName: text("legalName") ?? "", nif: text("nif"), address };
}

/** "2026-11-24" → "24/11/2026". */
export const spanishDate = (isoDate: string): string => `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}`;

const DATE_TIME = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Madrid" });

/** "2026-11-25T16:04:03+01:00" → "25 de noviembre de 2026, 16:04" (hora peninsular). */
export const spanishDateTime = (iso: string): string => DATE_TIME.format(new Date(iso));

const SHORT_DATE_TIME = new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" });

/** "2026-11-25T16:04:03+01:00" → "25/11/26, 16:04" (para tablas). */
export const spanishShortDateTime = (iso: string): string => SHORT_DATE_TIME.format(new Date(iso));

/** Lo que el emisor añade a un borrador o una factura además de sus datos fiscales. */
export interface IssuerExtras {
  /** Nombre comercial y contacto, bajo su domicilio. */
  readonly details: readonly string[];
  /** Forma de pago y vencimiento. */
  readonly payment: readonly string[];
  /** Datos registrales y pie de factura. */
  readonly legal: readonly string[];
}

/** Contacto, cobro y textos legales del emisor (de la instantánea al emitir; en un borrador, los de ahora). */
export function issuerExtrasFrom(snapshot: unknown, dueDate: string | null): IssuerExtras {
  const data = typeof snapshot === "object" && snapshot !== null ? (snapshot as Record<string, unknown>) : {};
  const text = (key: string): string | null => (typeof data[key] === "string" && data[key] !== "" ? data[key] : null);
  const present = (values: readonly (string | null)[]): string[] => values.filter((value): value is string => value !== null);
  const tradeName = text("tradeName");
  const phone = text("phone");
  const iban = text("iban");
  return {
    details: present([tradeName === text("legalName") ? null : tradeName, phone === null ? null : `Tel. ${phone}`, text("email"), text("website")]),
    payment: present([
      iban === null ? null : `Transferencia bancaria a ${formatIban(iban)}`,
      text("paymentInstructions"),
      dueDate === null ? null : `Vencimiento: ${spanishDate(dueDate)}`,
    ]),
    legal: present([text("registryInfo"), text("footerNote")]),
  };
}
