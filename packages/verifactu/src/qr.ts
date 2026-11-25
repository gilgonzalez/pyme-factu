// Código QR de la factura (OM HAC/1177/2024, arts. 20 y 21) y URL del servicio de cotejo, según el «Detalle
// de las especificaciones técnicas del código QR» v0.5.0 (specs/1.0). Ubicación y textos: ver la ficha web.
import QRCode from "qrcode";
import { aeatDate } from "./format";
import type { InvoiceId } from "./record";

/** Entorno del servicio de cotejo: producción solo cuando FacturaLibre funciona en producción. */
export type QrEnvironment = "production" | "test";

const VALIDATION_URL: Readonly<Record<QrEnvironment, string>> = {
  production: "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR",
  test: "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR",
};

/**
 * URL del QR con sus 4 parámetros obligatorios (apartado 6), codificados en UTF-8 con «URL encoding».
 * `importeTotal` es el ImporteTotal del registro de alta (el que la AEAT coteja).
 */
export function qrUrl(environment: QrEnvironment, invoice: InvoiceId, importeTotal: string): string {
  const parameters = [
    ["nif", invoice.issuerNif],
    ["numserie", invoice.number],
    ["fecha", aeatDate(invoice.issueDate)],
    ["importe", importeTotal],
  ] as const;
  return `${VALIDATION_URL[environment]}?${parameters.map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("&")}`;
}

/** SVG del QR (ISO/IEC 18004, nivel de corrección M). El tamaño (30–40 mm) y el margen los fija la página. */
export const qrSvg = (url: string): Promise<string> => QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 0 });

/** PNG del mismo QR (nivel M, sin margen propio) para el PDF de la factura; 8 píxeles por módulo. */
export const qrPng = (url: string): Promise<Buffer> => QRCode.toBuffer(url, { errorCorrectionLevel: "M", margin: 0, scale: 8 });
