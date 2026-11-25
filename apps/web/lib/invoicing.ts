// Utilidades de facturación para la interfaz (puras: sirven en servidor y en navegador).

/**
 * Tipos de IVA tal como los elige el usuario (claves de @facturalibre/fiscal-core). Las exenciones llevan su
 * causa (lista L10 de VERI*FACTU; ADR-008): art. 20 LIVA, arts. 23 y 24, u otra causa de la Ley del IVA.
 */
export const TAX_OPTIONS = [
  { value: "VAT:2100", label: "IVA 21 %" },
  { value: "VAT:1000", label: "IVA 10 %" },
  { value: "VAT:400", label: "IVA 4 %" },
  { value: "VAT:0", label: "IVA 0 %" },
  { value: "EXEMPT:E1", label: "Exenta (art. 20 LIVA)" },
  { value: "EXEMPT:E4", label: "Exenta (arts. 23 y 24 LIVA)" },
  { value: "EXEMPT:E6", label: "Exenta (otra causa de la LIVA)" },
] as const;

export type TaxKey = (typeof TAX_OPTIONS)[number]["value"];

/** Etiqueta de una clave guardada; la exención sin causa es un dato anterior a VERI*FACTU. */
export const taxLabel = (key: string): string =>
  TAX_OPTIONS.find((option) => option.value === key)?.label ?? (key === "EXEMPT" ? "Exenta (sin causa: indícala)" : key);

/** Tipos de factura rectificativa (lista L2 de VERI*FACTU), con la descripción oficial abreviada. */
export const RECTIFICATION_OPTIONS = [
  { value: "R1", label: "R1 · Error fundado en derecho o art. 80.1 y 80.2 LIVA" },
  { value: "R2", label: "R2 · Concurso de acreedores del destinatario (art. 80.3 LIVA)" },
  { value: "R3", label: "R3 · Créditos total o parcialmente incobrables (art. 80.4 LIVA)" },
  { value: "R4", label: "R4 · Resto de causas" },
] as const;

export const rectificationLabel = (code: string | null): string => RECTIFICATION_OPTIONS.find((option) => option.value === code)?.label ?? "Sin tipo";

const LINE_FIELD = /^lines\.(\d+)\.(\w+)$/;

/**
 * Reconstruye las líneas de un formulario cuyos campos se llaman "lines.<n>.<campo>"
 * (en el orden de <n>; los huecos de líneas borradas se ignoran).
 */
export function linesFromFormData(data: FormData): Record<string, string>[] {
  const rows = new Map<number, Record<string, string>>();
  for (const [key, value] of data.entries()) {
    const match = LINE_FIELD.exec(key);
    if (match === null || typeof value !== "string") continue;
    const index = Number(match[1]);
    rows.set(index, { ...rows.get(index), [match[2] ?? ""]: value });
  }
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([, row]) => row);
}

/** Campos simples del formulario (sin las líneas). */
export function fieldsFromFormData(data: FormData): Record<string, string> {
  return Object.fromEntries([...data.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string" && !LINE_FIELD.test(entry[0])));
}
