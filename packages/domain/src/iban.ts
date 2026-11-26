// IBAN (ISO 13616-1): país, longitud propia de cada país de la zona SEPA y dígitos de control mod 97-10
// (ISO 7064). Funciones puras: se usa para la cuenta de cobro que se imprime en borradores y facturas.

export type IbanError = "FORMAT" | "COUNTRY" | "LENGTH" | "CHECK_DIGITS";

export type ParsedIban = { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: IbanError };

/** Longitud total del IBAN en los países de la zona SEPA (registro IBAN de SWIFT). */
const LENGTHS: Readonly<Record<string, number>> = {
  AD: 24, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18, FR: 27, GB: 22,
  GI: 23, GR: 27, HR: 21, HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31, NL: 18,
  NO: 15, PL: 28, PT: 25, RO: 24, SE: 24, SI: 19, SK: 24, SM: 27, VA: 22,
};

/** Países cuyo BBAN es solo de cifras (en el resto puede llevar letras). */
const NUMERIC_BBAN: ReadonlySet<string> = new Set(["ES", "PT", "DE", "AT", "BE", "PL", "SE", "NO", "DK", "FI", "SK", "CZ", "SI", "EE", "LT", "HR", "HU"]);

const STRUCTURE = /^[A-Z]{2}\d{2}[A-Z0-9]+$/;

/** Resto mod 97 del IBAN reordenado (país y control al final) con las letras como números (A = 10…). */
function mod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const value = Number.parseInt(char, 36);
    remainder = (value < 10 ? remainder * 10 + value : remainder * 100 + value) % 97;
  }
  return remainder;
}

/** Normaliza (sin espacios ni guiones, en mayúsculas) y valida un IBAN. */
export function parseIban(raw: string): ParsedIban {
  const iban = raw.replace(/[\s-]/g, "").toUpperCase();
  if (!STRUCTURE.test(iban)) return { ok: false, error: "FORMAT" };
  const country = iban.slice(0, 2);
  const length = LENGTHS[country];
  if (length === undefined) return { ok: false, error: "COUNTRY" };
  if (iban.length !== length) return { ok: false, error: "LENGTH" };
  if (NUMERIC_BBAN.has(country) && !/^\d+$/.test(iban.slice(4))) return { ok: false, error: "FORMAT" };
  return mod97(iban) === 1 ? { ok: true, value: iban } : { ok: false, error: "CHECK_DIGITS" };
}

/** "ES9121000418450200051332" → "ES91 2100 0418 4502 0005 1332". */
export const formatIban = (iban: string): string => iban.replace(/(.{4})(?=.)/g, "$1 ");

const MESSAGES: Readonly<Record<IbanError, string>> = {
  FORMAT: "Escribe un IBAN: dos letras de país, dos cifras de control y el número de cuenta.",
  COUNTRY: "Ese país no usa IBAN en la zona SEPA. Revisa las dos primeras letras.",
  LENGTH: "Al IBAN le sobran o le faltan caracteres para ese país.",
  CHECK_DIGITS: "El IBAN no es válido: revisa las cifras (no cuadran los dígitos de control).",
};

export const ibanErrorMessage = (error: IbanError): string => MESSAGES[error];
