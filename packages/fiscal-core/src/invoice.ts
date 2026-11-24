// Cálculo de importes de una factura (función pura). Decisión documentada en ADR-007:
//  - base de cada línea = cantidad × precio × (1 − descuento), redondeada al céntimo;
//  - cuota de IVA y de recargo de equivalencia sobre la BASE ACUMULADA de cada tipo (no línea a línea),
//    que nunca rebaja la cuota frente a aplicar el tipo a la base (art. 90 LIVA; criterio TEAC 26/11/2024);
//  - retención de IRPF sobre la base total;
//  - redondeo «mitad hacia arriba», simétrico en negativos (rectificaciones por diferencias).
import { divideRoundHalfUp, parseDecimal } from "./decimal";

/** Escalas: cantidades con 3 decimales, precios unitarios con 4, porcentajes con 2, importes en céntimos. */
export const SCALE = { quantity: 3, unitPrice: 4, percent: 2, amount: 2 } as const;

const HUNDRED_PERCENT = 10_000n; // 100,00 % a escala 2
/** quantity(3) + unitPrice(4) + porcentaje restante(4: 10000 = 100 %) − importe(2) = 9 decimales sobrantes. */
const LINE_DIVISOR = 10n ** 9n;

/** Tipos de IVA admitidos (general, reducido, superreducido y 0 %), en porcentaje a escala 2. */
export const VAT_RATES = [2100n, 1000n, 400n, 0n] as const;
/** Recargo de equivalencia asociado a cada tipo de IVA (5,2 %, 1,4 %, 0,5 %, 0 %). */
const SURCHARGE_BY_RATE: ReadonlyMap<bigint, bigint> = new Map([
  [2100n, 520n],
  [1000n, 140n],
  [400n, 50n],
  [0n, 0n],
]);

export type TaxCategory = { readonly kind: "VAT"; readonly ratePercent: bigint } | { readonly kind: "EXEMPT" };

export const taxCategoryKey = (tax: TaxCategory): string => (tax.kind === "EXEMPT" ? "EXEMPT" : `VAT:${tax.ratePercent.toString()}`);

/** "VAT:2100" | "EXEMPT" → categoría, o null si no es un tipo admitido. */
export function parseTaxCategory(key: unknown): TaxCategory | null {
  if (key === "EXEMPT") return { kind: "EXEMPT" };
  const rate = VAT_RATES.find((candidate) => key === `VAT:${candidate.toString()}`);
  return rate === undefined ? null : { kind: "VAT", ratePercent: rate };
}

export interface InvoiceLine {
  readonly quantity: bigint;
  readonly unitPrice: bigint;
  readonly discountPercent: bigint;
  readonly tax: TaxCategory;
}

export function lineBase(line: InvoiceLine): bigint {
  return divideRoundHalfUp(line.quantity * line.unitPrice * (HUNDRED_PERCENT - line.discountPercent), LINE_DIVISOR);
}

export interface InvoiceInput {
  readonly lines: readonly InvoiceLine[];
  /** El destinatario está en el régimen especial del recargo de equivalencia. */
  readonly equivalenceSurcharge: boolean;
  /** Retención de IRPF en porcentaje a escala 2 (0n si no hay). */
  readonly withholdingPercent: bigint;
}

export interface TaxBreakdown {
  readonly key: string;
  readonly tax: TaxCategory;
  readonly base: bigint;
  readonly quota: bigint;
  readonly surchargePercent: bigint;
  readonly surchargeQuota: bigint;
}

export interface InvoiceTotals {
  readonly lineBases: readonly bigint[];
  readonly breakdown: readonly TaxBreakdown[];
  readonly taxableBase: bigint;
  readonly vatTotal: bigint;
  readonly surchargeTotal: bigint;
  readonly withholdingAmount: bigint;
  readonly total: bigint;
}

const percentOf = (base: bigint, percent: bigint): bigint => divideRoundHalfUp(base * percent, HUNDRED_PERCENT);
const ratePercent = (tax: TaxCategory): bigint => (tax.kind === "VAT" ? tax.ratePercent : 0n);
/** Orden estable del desglose: tipos de IVA de mayor a menor y, al final, las operaciones exentas. */
const sortWeight = (tax: TaxCategory): bigint => (tax.kind === "VAT" ? tax.ratePercent : -1n);

function breakdownFor(tax: TaxCategory, base: bigint, equivalenceSurcharge: boolean): TaxBreakdown {
  const surchargePercent = equivalenceSurcharge && tax.kind === "VAT" ? (SURCHARGE_BY_RATE.get(tax.ratePercent) ?? 0n) : 0n;
  return {
    key: taxCategoryKey(tax),
    tax,
    base,
    quota: percentOf(base, ratePercent(tax)),
    surchargePercent,
    surchargeQuota: percentOf(base, surchargePercent),
  };
}

const sum = (values: readonly bigint[]): bigint => values.reduce((total, value) => total + value, 0n);

export function calculateInvoice(input: InvoiceInput): InvoiceTotals {
  const lineBases = input.lines.map(lineBase);
  const groups = new Map<string, { tax: TaxCategory; base: bigint }>();
  input.lines.forEach((line, index) => {
    const key = taxCategoryKey(line.tax);
    const group = groups.get(key) ?? { tax: line.tax, base: 0n };
    groups.set(key, { tax: group.tax, base: group.base + (lineBases[index] ?? 0n) });
  });
  const breakdown = [...groups.values()]
    .sort((a, b) => Number(sortWeight(b.tax) - sortWeight(a.tax)))
    .map((group) => breakdownFor(group.tax, group.base, input.equivalenceSurcharge));

  const taxableBase = sum(breakdown.map((entry) => entry.base));
  const vatTotal = sum(breakdown.map((entry) => entry.quota));
  const surchargeTotal = sum(breakdown.map((entry) => entry.surchargeQuota));
  const withholdingAmount = percentOf(taxableBase, input.withholdingPercent);
  return { lineBases, breakdown, taxableBase, vatTotal, surchargeTotal, withholdingAmount, total: taxableBase + vatTotal + surchargeTotal - withholdingAmount };
}

// ─── Formulario de línea ─────────────────────────────────────────────────────

export interface ParsedLine extends InvoiceLine {
  readonly description: string;
}

type LineField = "description" | "quantity" | "unitPrice" | "discountPercent" | "tax";
export type ParsedLineResult =
  | { readonly ok: true; readonly value: ParsedLine }
  | { readonly ok: false; readonly errors: Partial<Record<LineField, string>> };

const DESCRIPTION_MAX = 500;

function descriptionError(description: string | null): string | undefined {
  if (description === null || description === "") return "Describe el producto o servicio.";
  return description.length > DESCRIPTION_MAX ? `La descripción no puede superar los ${DESCRIPTION_MAX} caracteres.` : undefined;
}

function quantityOf(raw: unknown): bigint | string {
  const parsed = parseDecimal(raw, SCALE.quantity, { allowNegative: true });
  if (!parsed.ok) return "Escribe una cantidad con hasta 3 decimales.";
  return parsed.value === 0n ? "La cantidad no puede ser cero." : parsed.value;
}

function unitPriceOf(raw: unknown): bigint | string {
  const parsed = parseDecimal(raw, SCALE.unitPrice);
  return parsed.ok ? parsed.value : "Escribe un precio de 0 o más, con hasta 4 decimales.";
}

function discountOf(raw: unknown): bigint | string {
  if (raw === undefined || (typeof raw === "string" && raw.trim() === "")) return 0n;
  const parsed = parseDecimal(raw, SCALE.percent);
  return parsed.ok && parsed.value <= HUNDRED_PERCENT ? parsed.value : "El descuento debe estar entre 0 y 100 %.";
}

/** Convierte los textos de una línea del formulario en una línea exacta, o explica cada error. */
export function parseInvoiceLine(raw: { readonly [K in LineField]?: unknown }): ParsedLineResult {
  const description = typeof raw.description === "string" ? raw.description.trim() : null;
  const quantity = quantityOf(raw.quantity);
  const unitPrice = unitPriceOf(raw.unitPrice);
  const discountPercent = discountOf(raw.discountPercent);
  const tax = parseTaxCategory(raw.tax);
  const candidates: [LineField, string | undefined][] = [
    ["description", descriptionError(description)],
    ["quantity", typeof quantity === "string" ? quantity : undefined],
    ["unitPrice", typeof unitPrice === "string" ? unitPrice : undefined],
    ["discountPercent", typeof discountPercent === "string" ? discountPercent : undefined],
    ["tax", tax === null ? "Elige un tipo de IVA." : undefined],
  ];
  const errors = candidates.filter((entry): entry is [LineField, string] => entry[1] !== undefined);
  if (errors.length > 0 || description === null || typeof quantity === "string" || typeof unitPrice === "string" || typeof discountPercent === "string" || tax === null) {
    return { ok: false, errors: Object.fromEntries(errors) };
  }
  return { ok: true, value: { description, quantity, unitPrice, discountPercent, tax } };
}
