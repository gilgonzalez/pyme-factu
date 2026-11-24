// Aritmética decimal exacta con enteros (bigint) a escala fija. Nunca coma flotante con importes.

export type DecimalError = "FORMAT" | "TOO_MANY_DECIMALS" | "NEGATIVE";
export type ParsedDecimal = { readonly ok: true; readonly value: bigint } | { readonly ok: false; readonly error: DecimalError };

/** Un signo opcional, cifras y, opcionalmente, UN separador decimal (coma o punto) seguido de cifras. */
const DECIMAL = /^-?\d+(?:[.,]\d+)?$/;

/** Valor absoluto. */
// Stryker disable next-line EqualityOperator: con 0 ambas ramas devuelven 0 (mutante equivalente).
const absolute = (value: bigint): bigint => (value < 0n ? -value : value);
const signOf = (value: bigint): string => (value < 0n ? "-" : "");

/**
 * Convierte un texto de formulario en un entero escalado: "12,5" con escala 2 → 1250n.
 * No admite separadores de miles (serían ambiguos con el punto decimal).
 */
export function parseDecimal(input: unknown, scale: number, options: { readonly allowNegative?: boolean } = {}): ParsedDecimal {
  if (typeof input !== "string") return { ok: false, error: "FORMAT" };
  const text = input.trim();
  if (!DECIMAL.test(text)) return { ok: false, error: "FORMAT" };
  const negative = text.startsWith("-");
  if (negative && options.allowNegative !== true) return { ok: false, error: "NEGATIVE" };
  const unsigned = negative ? text.slice(1) : text;
  const separator = unsigned.search(/[.,]/);
  const fractionLength = separator === -1 ? 0 : unsigned.length - separator - 1;
  if (fractionLength > scale) return { ok: false, error: "TOO_MANY_DECIMALS" };
  const magnitude = BigInt(unsigned.replace(/[.,]/, "") + "0".repeat(scale - fractionLength));
  return { ok: true, value: negative ? -magnitude : magnitude };
}

/** División entera redondeando la mitad hacia arriba en valor absoluto (simétrico para negativos). `denominator` > 0. */
export function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  if (absolute(numerator % denominator) * 2n < denominator) return quotient;
  // Stryker disable next-line EqualityOperator: con numerator = 0 el resto es 0 y ya se ha devuelto arriba (equivalente).
  return numerator < 0n ? quotient - 1n : quotient + 1n;
}

/** Importe en céntimos → "1.234,56 €". */
export function formatAmount(cents: bigint): string {
  const magnitude = absolute(cents);
  const whole = (magnitude / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const fraction = (magnitude % 100n).toString().padStart(2, "0");
  return `${signOf(cents)}${whole},${fraction} €`;
}

/** Entero escalado → texto con coma decimal y sin ceros finales: (1500n, 3) → "1,5". */
export function formatDecimal(value: bigint, scale: number): string {
  const unit = 10n ** BigInt(scale);
  const magnitude = absolute(value);
  const fraction = (magnitude % unit).toString().padStart(scale, "0").replace(/0+$/, "");
  return `${signOf(value)}${(magnitude / unit).toString()}${fraction === "" ? "" : `,${fraction}`}`;
}
