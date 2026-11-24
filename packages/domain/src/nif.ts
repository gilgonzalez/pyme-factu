// Validación del NIF español (función pura). Cubre:
//  - DNI: 8 números + letra de control (módulo 23).
//  - NIE: X/Y/Z + 7 números + letra (X→0, Y→1, Z→2 y algoritmo del DNI).
//  - NIF especiales de personas físicas K/L/M + 7 números + letra (algoritmo del DNI sobre los 7 números).
//  - Personas jurídicas y entidades (antiguo CIF): letra de forma jurídica + 7 números + control (dígito o letra).
// Referencia: Orden EHA/451/2008 (composición del NIF de personas jurídicas y entidades) y RD 1065/2007.

export type NifKind = "DNI" | "NIE" | "NIF_ESPECIAL" | "CIF";
export type NifPersonType = "NATURAL_PERSON" | "LEGAL_ENTITY";
export type NifError = "FORMAT" | "CHECK_DIGIT";

export interface Nif {
  /** Forma canónica: 9 caracteres en mayúsculas, sin separadores. */
  readonly nif: string;
  readonly kind: NifKind;
  readonly personType: NifPersonType;
}

export type ParsedNif = { readonly ok: true; readonly value: Nif } | { readonly ok: false; readonly error: NifError };

const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
const CIF_LETTERS = "JABCDEFGHI";
/** Prefijo del NIE: X, Y, Z valen 0, 1, 2 como cifra inicial del número. */
const NIE_PREFIXES = "XYZ";

/** Formas jurídicas cuyo control es SIEMPRE una letra / SIEMPRE un dígito; el resto admite ambos. */
const CIF_LETTER_CONTROL = new Set(["N", "P", "Q", "R", "S", "W"]);
const CIF_DIGIT_CONTROL = new Set(["A", "B", "E", "H"]);

const dniLetter = (digits: number): string => DNI_LETTERS.charAt(digits % 23);

/** Dígito de control del antiguo CIF sobre los 7 números centrales. */
function cifControlDigit(digits: string): number {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    const digit = Number(digits[index]);
    if (index % 2 === 0) {
      const doubled = digit * 2;
      sum += Math.floor(doubled / 10) + (doubled % 10);
    } else {
      sum += digit;
    }
  }
  return (10 - (sum % 10)) % 10;
}

function validCifControl(first: string, digits: string, control: string): boolean {
  const digit = cifControlDigit(digits);
  const asDigit = control === String(digit);
  const asLetter = control === CIF_LETTERS.charAt(digit);
  if (CIF_LETTER_CONTROL.has(first)) return asLetter;
  if (CIF_DIGIT_CONTROL.has(first)) return asDigit;
  return asDigit || asLetter;
}

interface Shape {
  readonly pattern: RegExp;
  readonly kind: NifKind;
  readonly valid: (nif: string) => boolean;
}

const SHAPES: readonly Shape[] = [
  { pattern: /^\d{8}[A-Z]$/, kind: "DNI", valid: (nif) => nif.charAt(8) === dniLetter(Number(nif.slice(0, 8))) },
  { pattern: /^[XYZ]\d{7}[A-Z]$/, kind: "NIE", valid: (nif) => nif.charAt(8) === dniLetter(NIE_PREFIXES.indexOf(nif.charAt(0)) * 10_000_000 + Number(nif.slice(1, 8))) },
  { pattern: /^[KLM]\d{7}[A-Z]$/, kind: "NIF_ESPECIAL", valid: (nif) => nif.charAt(8) === dniLetter(Number(nif.slice(1, 8))) },
  {
    pattern: /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/,
    kind: "CIF",
    valid: (nif) => validCifControl(nif.charAt(0), nif.slice(1, 8), nif.charAt(8)),
  },
];

/** Normaliza (mayúsculas, sin espacios, puntos ni guiones) y valida un NIF español. */
export function parseNif(input: unknown): ParsedNif {
  if (typeof input !== "string") return { ok: false, error: "FORMAT" };
  const nif = input.toUpperCase().replace(/[\s.-]/g, "");
  const shape = SHAPES.find((candidate) => candidate.pattern.test(nif));
  if (shape === undefined) return { ok: false, error: "FORMAT" };
  if (!shape.valid(nif)) return { ok: false, error: "CHECK_DIGIT" };
  return { ok: true, value: { nif, kind: shape.kind, personType: shape.kind === "CIF" ? "LEGAL_ENTITY" : "NATURAL_PERSON" } };
}

const MESSAGES: Readonly<Record<NifError, string>> = {
  FORMAT: "Escribe un NIF de 9 caracteres: 8 números y una letra (DNI), o letra, 7 números y control.",
  CHECK_DIGIT: "El NIF no es válido: revisa el último carácter (control).",
};

export const nifErrorMessage = (error: NifError): string => MESSAGES[error];
