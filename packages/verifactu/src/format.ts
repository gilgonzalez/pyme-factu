// Formato de los campos del registro según el XSD (SuministroInformacion.xsd) y el apartado 6.8 de la
// «Descripción de los servicios web» v1.0.3: "." como separador decimal y sin ceros a la izquierda.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2024-09-01" → "01-09-2024" (tipo `fecha`: DD-MM-AAAA). */
export function aeatDate(isoDate: string): string {
  if (!ISO_DATE.test(isoDate)) throw new RangeError(`Fecha ISO no válida: ${isoDate}`);
  return isoDate.replace(ISO_DATE, "$3-$2-$1");
}

const MAX_AMOUNT_UNITS = 10n ** 12n;

/** Céntimos → "131.40" / "-0.40" (ImporteSgn12.2: hasta 12 dígitos enteros y 2 decimales). */
export function aeatAmount(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  // Stryker disable next-line EqualityOperator: con `<=`, el cero se niega y -0n === 0n (mutante equivalente).
  const magnitude = cents < 0n ? -cents : cents;
  const units = magnitude / 100n;
  if (units >= MAX_AMOUNT_UNITS) throw new RangeError("El importe supera los 12 dígitos enteros que admite la AEAT.");
  return `${sign}${units.toString()}.${(magnitude % 100n).toString().padStart(2, "0")}`;
}

/** Porcentaje a escala 2 → "21", "5.2", "0.5" (Tipo2.2: hasta 3 dígitos enteros y 2 decimales). */
export function aeatPercent(scaled: bigint): string {
  if (scaled < 0n || scaled >= 100_000n) throw new RangeError("Porcentaje fuera de rango.");
  const decimals = (scaled % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  const units = (scaled / 100n).toString();
  return decimals === "" ? units : `${units}.${decimals}`;
}

/**
 * Fecha, hora y huso de generación del registro, «de acuerdo al territorio desde donde se expide la factura»
 * (OM HAC/1177/2024, art. 7.e y 7.g): "2024-01-01T19:20:30+01:00". Por defecto, la España peninsular.
 */
export function generationTimestamp(instant: Date, timeZone = "Europe/Madrid"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(instant);
  // Stryker disable next-line StringLiteral: con estas opciones Intl siempre devuelve las 7 partes; "" es inalcanzable.
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((candidate) => candidate.type === type)?.value ?? "";
  // "GMT+01:00" → "+01:00"; en UTC la zona se escribe solo "GMT".
  const offset = part("timeZoneName").replace("GMT", "") || "+00:00";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}${offset}`;
}
