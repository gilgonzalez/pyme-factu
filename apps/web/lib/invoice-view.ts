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
