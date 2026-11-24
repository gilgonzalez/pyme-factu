// Huella («hash») de los registros de facturación: OM HAC/1177/2024, art. 13, y «Detalle de las
// especificaciones técnicas para generación de la huella o hash», AEAT v0.1.2 (specs/1.0).
import { createHash } from "node:crypto";

/** Campos de la huella de un registro de alta, ya con el texto exacto que lleva el XML. */
export interface AltaHashFields {
  readonly issuerNif: string;
  readonly invoiceNumber: string;
  readonly issueDate: string;
  readonly invoiceType: string;
  readonly cuotaTotal: string;
  readonly importeTotal: string;
  /** Huella del registro anterior; "" en el primer registro de la cadena. */
  readonly previousHash: string;
  readonly generatedAt: string;
}

export interface AnulacionHashFields {
  readonly issuerNif: string;
  readonly invoiceNumber: string;
  readonly issueDate: string;
  readonly previousHash: string;
  readonly generatedAt: string;
}

/** «nombreCampo1=valorCampo1&…», sin espacios al inicio ni al final de cada valor (apartado 3). */
const join = (pairs: readonly (readonly [string, string])[]): string => pairs.map(([name, value]) => `${name}=${value.trim()}`).join("&");

export const altaHashInput = (fields: AltaHashFields): string =>
  join([
    ["IDEmisorFactura", fields.issuerNif],
    ["NumSerieFactura", fields.invoiceNumber],
    ["FechaExpedicionFactura", fields.issueDate],
    ["TipoFactura", fields.invoiceType],
    ["CuotaTotal", fields.cuotaTotal],
    ["ImporteTotal", fields.importeTotal],
    ["Huella", fields.previousHash],
    ["FechaHoraHusoGenRegistro", fields.generatedAt],
  ]);

export const anulacionHashInput = (fields: AnulacionHashFields): string =>
  join([
    ["IDEmisorFacturaAnulada", fields.issuerNif],
    ["NumSerieFacturaAnulada", fields.invoiceNumber],
    ["FechaExpedicionFacturaAnulada", fields.issueDate],
    ["Huella", fields.previousHash],
    ["FechaHoraHusoGenRegistro", fields.generatedAt],
  ]);

/** SHA-256 (lista L12) de la cadena codificada en UTF-8, en hexadecimal y mayúsculas: 64 caracteres. */
export const fingerprint = (input: string): string => createHash("sha256").update(input, "utf8").digest("hex").toUpperCase();
