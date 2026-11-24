// Utilidades de facturación para la interfaz (puras: sirven en servidor y en navegador).

/** Tipos de IVA tal como los elige el usuario (claves de @facturalibre/fiscal-core). */
export const TAX_OPTIONS = [
  { value: "VAT:2100", label: "IVA 21 %" },
  { value: "VAT:1000", label: "IVA 10 %" },
  { value: "VAT:400", label: "IVA 4 %" },
  { value: "VAT:0", label: "IVA 0 %" },
  { value: "EXEMPT", label: "Exento" },
] as const;

export type TaxKey = (typeof TAX_OPTIONS)[number]["value"];

export const taxLabel = (key: string): string => TAX_OPTIONS.find((option) => option.value === key)?.label ?? key;

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
