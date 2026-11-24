// Registros de facturación de alta y de anulación (OM HAC/1177/2024, arts. 7, 10, 11 y 13; XSD
// SuministroInformacion v1.0). Funciones puras: la base de datos decide QUÉ registro va detrás de cuál; aquí se
// decide su CONTENIDO y su huella. Ver ADR-008.
import type { TaxBreakdown } from "@facturalibre/fiscal-core";
import { aeatAmount, aeatDate } from "./format";
import { altaHashInput, anulacionHashInput, fingerprint } from "./hash";

/** Claves de tipo de factura admitidas (lista L2): completa y rectificativas R1–R4. Ver ADR-008. */
export const RECTIFICATION_TYPES = ["R1", "R2", "R3", "R4"] as const;
export type RectificationType = (typeof RECTIFICATION_TYPES)[number];
export type InvoiceType = "F1" | RectificationType;

/** Identificador de una factura para la AEAT: NIF del emisor + serie y número + fecha de expedición (ISO). */
export interface InvoiceId {
  readonly issuerNif: string;
  readonly number: string;
  readonly issueDate: string;
}

/** Enlace con el registro inmediatamente anterior de la cadena (art. 7.a). */
export interface ChainLink extends InvoiceId {
  readonly hash: string;
}

/** Sistema informático de facturación (agrupación SistemaInformatico). */
export interface Software {
  readonly producerName: string;
  readonly producerNif: string;
  readonly name: string;
  /** IdSistemaInformatico: 2 caracteres asignados por el productor. */
  readonly id: string;
  readonly version: string;
}

/** «Facturación» (SIF virtual): su número de instalación y si el usuario lleva más de un obligado. */
export interface BillingSystemIdentity {
  readonly installationNumber: string;
  readonly multipleTaxpayers: boolean;
}

export interface RecordContext {
  /** null = primer registro de la cadena (art. 7.b). */
  readonly previous: ChainLink | null;
  readonly system: BillingSystemIdentity;
  readonly software: Software;
  /** FechaHoraHusoGenRegistro ya formateada (ver `generationTimestamp`). */
  readonly generatedAt: string;
}

export interface AltaData {
  readonly invoice: InvoiceId;
  readonly issuerName: string;
  readonly type: InvoiceType;
  /** Facturas rectificadas (solo en rectificativas). */
  readonly rectified: readonly InvoiceId[];
  readonly description: string;
  readonly recipient: { readonly name: string; readonly nif: string | null };
  /** Desglose por tipo calculado por fiscal-core (una entrada = un DetalleDesglose). */
  readonly details: readonly TaxBreakdown[];
}

export interface AltaRecord {
  readonly kind: "ALTA";
  readonly data: AltaData;
  readonly context: RecordContext;
  readonly cuotaTotal: string;
  readonly importeTotal: string;
  readonly hash: string;
}

export interface AnulacionRecord {
  readonly kind: "ANULACION";
  readonly invoice: InvoiceId;
  readonly context: RecordContext;
  readonly hash: string;
}

export type BillingRecord = AltaRecord | AnulacionRecord;

// ─── Validación (antes de expedir: un registro rechazado obliga a subsanar) ───

/** ASCII 32–126 sin " ' < = > (validación 3.1.3.1 del documento de validaciones v1.2.2). */
const SERIES_NUMBER = /^[ !#-&(-;?-~]{1,60}$/;
const MAX_DETAILS = 12;

const between = (text: string, min: number, max: number): boolean => text.length >= min && text.length <= max;

function partyErrors(data: AltaData, errors: Record<string, string>): void {
  if (data.issuerName === "") errors["issuerName"] = "Falta el nombre del emisor.";
  else if (data.issuerName.length > 120) errors["issuerName"] = "El nombre del emisor no puede superar los 120 caracteres.";
  if (!between(data.recipient.name, 1, 120)) errors["recipient"] = "El nombre del cliente debe tener entre 1 y 120 caracteres.";
  else if (data.recipient.nif === null) errors["recipient"] = "El cliente necesita NIF: una factura completa debe identificar al destinatario.";
}

function detailErrors(details: readonly TaxBreakdown[]): string | null {
  if (details.length === 0) return "La factura no tiene importes que declarar.";
  if (details.length > MAX_DETAILS) return "Una factura admite como máximo 12 tipos impositivos distintos.";
  const missingCause = details.some((detail) => detail.tax.kind === "EXEMPT" && detail.tax.cause === null);
  return missingCause ? "Indica la causa de la exención en todas las líneas exentas." : null;
}

function rectificationError(data: AltaData): string | null {
  const rectifying = data.type !== "F1";
  if (rectifying && data.rectified.length === 0) return "Una rectificativa debe identificar la factura que rectifica.";
  if (!rectifying && data.rectified.length > 0) return "Solo una rectificativa identifica facturas rectificadas.";
  return null;
}

/** Errores (en español, por campo) que harían que la AEAT rechazase el registro; {} si no hay. */
export function validateAlta(data: AltaData): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};
  if (!SERIES_NUMBER.test(data.invoice.number)) errors["number"] = "El número de factura solo puede llevar caracteres ASCII imprimibles (sin comillas, <, > ni =) y hasta 60.";
  partyErrors(data, errors);
  if (!between(data.description, 1, 500)) errors["description"] = "La descripción de la operación debe tener entre 1 y 500 caracteres.";
  const details = detailErrors(data.details);
  if (details !== null) errors["details"] = details;
  const rectified = rectificationError(data);
  if (rectified !== null) errors["rectified"] = rectified;
  return errors;
}

/** Comprueba la configuración del sistema informático; devuelve la lista de problemas (vacía si es válida). */
export function validateSoftware(software: Software): string[] {
  const problems: string[] = [];
  if (!between(software.producerName, 1, 120)) problems.push("producerName: entre 1 y 120 caracteres");
  if (!/^[0-9A-Z]{9}$/.test(software.producerNif)) problems.push("producerNif: NIF de 9 caracteres");
  if (!between(software.name, 1, 30)) problems.push("name: entre 1 y 30 caracteres");
  if (!/^[0-9A-Z]{2}$/.test(software.id)) problems.push("id: 2 caracteres, letras mayúsculas (sin Ñ) o dígitos");
  if (!between(software.version, 1, 50)) problems.push("version: entre 1 y 50 caracteres");
  return problems;
}

// ─── Construcción ────────────────────────────────────────────────────────────

const sum = (values: readonly bigint[]): bigint => values.reduce((total, value) => total + value, 0n);

/** Registro de alta con sus totales (validaciones 16 y 17) y su huella. `data` debe haber pasado `validateAlta`. */
export function buildAlta(data: AltaData, context: RecordContext): AltaRecord {
  const quotas = sum(data.details.map((detail) => detail.quota + detail.surchargeQuota));
  const cuotaTotal = aeatAmount(quotas);
  const importeTotal = aeatAmount(sum(data.details.map((detail) => detail.base)) + quotas);
  const hash = fingerprint(
    altaHashInput({
      issuerNif: data.invoice.issuerNif,
      invoiceNumber: data.invoice.number,
      issueDate: aeatDate(data.invoice.issueDate),
      invoiceType: data.type,
      cuotaTotal,
      importeTotal,
      previousHash: context.previous?.hash ?? "",
      generatedAt: context.generatedAt,
    }),
  );
  return { kind: "ALTA", data, context, cuotaTotal, importeTotal, hash };
}

/** Registro de anulación de una factura ya registrada (art. 11). */
export function buildAnulacion(invoice: InvoiceId, context: RecordContext): AnulacionRecord {
  const hash = fingerprint(
    anulacionHashInput({
      issuerNif: invoice.issuerNif,
      invoiceNumber: invoice.number,
      issueDate: aeatDate(invoice.issueDate),
      previousHash: context.previous?.hash ?? "",
      generatedAt: context.generatedAt,
    }),
  );
  return { kind: "ANULACION", invoice, context, hash };
}

/** Datos que el registro siguiente de la cadena incluye sobre este (art. 7.a). */
export function chainLinkOf(record: BillingRecord): ChainLink {
  const invoice = record.kind === "ALTA" ? record.data.invoice : record.invoice;
  return { ...invoice, hash: record.hash };
}

const DESCRIPTION_MAX = 500;

/** DescripcionOperacion: las descripciones distintas de las líneas, unidas con «; » y recortadas a 500. */
export function describeOperation(lineDescriptions: readonly string[]): string {
  const text = [...new Set(lineDescriptions.map((description) => description.trim()))].join("; ");
  return text.length <= DESCRIPTION_MAX ? text : `${text.slice(0, DESCRIPTION_MAX - 1)}…`;
}
