// Datos de presentación de una factura compartidos por su ficha web y su PDF.

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
  const address = [text("addressLine"), [text("postalCode"), text("city")].filter(Boolean).join(" "), text("province")].filter(Boolean).join(", ");
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
