// XML de los registros y del envío, en el orden exacto de los XSD oficiales (specs/1.0/SuministroInformacion.xsd
// y SuministroLR.xsd). Se guarda el XML de cada registro tal cual se generó: es lo que se remite y se conserva.
import type { TaxBreakdown } from "@facturalibre/fiscal-core";
import { aeatAmount, aeatDate, aeatPercent } from "./format";
import type { AltaRecord, AnulacionRecord, BillingRecord, InvoiceId, RecordContext } from "./record";

const BASE = "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws";
export const NAMESPACES = {
  sf: `${BASE}/SuministroInformacion.xsd`,
  sfLR: `${BASE}/SuministroLR.xsd`,
  sfR: `${BASE}/RespuestaSuministro.xsd`,
  soapenv: "http://schemas.xmlsoap.org/soap/envelope/",
} as const;

/** Apartado 6.9 de la descripción de los servicios web: & y < se escapan (y >, " y ' por prudencia). */
const escapeXml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Valor de texto sin espacios al inicio ni al final (apartado 6.7; así coincide con la huella). */
const leaf = (name: string, value: string): string => `<sf:${name}>${escapeXml(value.trim())}</sf:${name}>`;
const group = (name: string, ...children: readonly string[]): string => `<sf:${name}>${children.join("")}</sf:${name}>`;

const invoiceIdXml = (id: InvoiceId): string[] => [leaf("IDEmisorFactura", id.issuerNif), leaf("NumSerieFactura", id.number), leaf("FechaExpedicionFactura", aeatDate(id.issueDate))];

const subjectDetail = (detail: TaxBreakdown, ratePercent: bigint): string[] => [
  leaf("CalificacionOperacion", "S1"),
  leaf("TipoImpositivo", aeatPercent(ratePercent)),
  leaf("BaseImponibleOimporteNoSujeto", aeatAmount(detail.base)),
  leaf("CuotaRepercutida", aeatAmount(detail.quota)),
  ...(detail.surchargePercent === 0n
    ? []
    : [leaf("TipoRecargoEquivalencia", aeatPercent(detail.surchargePercent)), leaf("CuotaRecargoEquivalencia", aeatAmount(detail.surchargeQuota))]),
];

/** Datos que `validateAlta` garantiza; si faltan aquí es un error de programación, no del usuario. */
function required(value: string | null, what: string): string {
  if (value === null) throw new Error(`${what}: el registro debe pasar validateAlta antes de generarse.`);
  return value;
}

function detailBody(detail: TaxBreakdown): string[] {
  const { tax } = detail;
  if (tax.kind === "VAT") return subjectDetail(detail, tax.ratePercent);
  return [leaf("OperacionExenta", required(tax.cause, "Exención sin causa")), leaf("BaseImponibleOimporteNoSujeto", aeatAmount(detail.base))];
}

/** Un DetalleDesglose: IVA (01), régimen general (01) y operación sujeta (S1) o exenta con su causa. */
const detailXml = (detail: TaxBreakdown): string => group("DetalleDesglose", leaf("Impuesto", "01"), leaf("ClaveRegimen", "01"), ...detailBody(detail));

const chainXml = (context: RecordContext): string =>
  context.previous === null
    ? group("Encadenamiento", leaf("PrimerRegistro", "S"))
    : group("Encadenamiento", group("RegistroAnterior", ...invoiceIdXml(context.previous), leaf("Huella", context.previous.hash)));

const systemXml = ({ software, system }: RecordContext): string =>
  group(
    "SistemaInformatico",
    leaf("NombreRazon", software.producerName),
    leaf("NIF", software.producerNif),
    leaf("NombreSistemaInformatico", software.name),
    leaf("IdSistemaInformatico", software.id),
    leaf("Version", software.version),
    leaf("NumeroInstalacion", system.installationNumber),
    // Solo se ofrece la modalidad VERI*FACTU y un mismo sistema lleva varios obligados (OM art. 2).
    leaf("TipoUsoPosibleSoloVerifactu", "S"),
    leaf("TipoUsoPosibleMultiOT", "S"),
    leaf("IndicadorMultiplesOT", system.multipleTaxpayers ? "S" : "N"),
  );

/** Cierre común: encadenamiento, sistema, fecha-hora-huso, tipo de huella (01 = SHA-256) y huella. */
const trailerXml = (record: BillingRecord): string[] => [
  chainXml(record.context),
  systemXml(record.context),
  leaf("FechaHoraHusoGenRegistro", record.context.generatedAt),
  leaf("TipoHuella", "01"),
  leaf("Huella", record.hash),
];

function rectificationXml(record: AltaRecord): string[] {
  if (record.data.type === "F1") return [];
  // Rectificativa por diferencias (I): la que prepara FacturaLibre. La sustitutiva (S) no se ofrece.
  return [leaf("TipoRectificativa", "I"), group("FacturasRectificadas", ...record.data.rectified.map((id) => group("IDFacturaRectificada", ...invoiceIdXml(id))))];
}

function altaXml(record: AltaRecord): string {
  const { data } = record;
  return [
    `<sf:RegistroAlta xmlns:sf="${NAMESPACES.sf}">`,
    leaf("IDVersion", "1.0"),
    group("IDFactura", ...invoiceIdXml(data.invoice)),
    leaf("NombreRazonEmisor", data.issuerName),
    leaf("TipoFactura", data.type),
    ...rectificationXml(record),
    leaf("DescripcionOperacion", data.description),
    group("Destinatarios", group("IDDestinatario", leaf("NombreRazon", data.recipient.name), leaf("NIF", required(data.recipient.nif, "Destinatario sin NIF")))),
    group("Desglose", ...data.details.map(detailXml)),
    leaf("CuotaTotal", record.cuotaTotal),
    leaf("ImporteTotal", record.importeTotal),
    ...trailerXml(record),
    "</sf:RegistroAlta>",
  ].join("");
}

function anulacionXml(record: AnulacionRecord): string {
  const { invoice } = record;
  return [
    `<sf:RegistroAnulacion xmlns:sf="${NAMESPACES.sf}">`,
    leaf("IDVersion", "1.0"),
    group(
      "IDFactura",
      leaf("IDEmisorFacturaAnulada", invoice.issuerNif),
      leaf("NumSerieFacturaAnulada", invoice.number),
      leaf("FechaExpedicionFacturaAnulada", aeatDate(invoice.issueDate)),
    ),
    ...trailerXml(record),
    "</sf:RegistroAnulacion>",
  ].join("");
}

/** XML de un registro (elemento RegistroAlta o RegistroAnulacion con su espacio de nombres). */
export const recordXml = (record: BillingRecord): string => (record.kind === "ALTA" ? altaXml(record) : anulacionXml(record));

export interface SubmissionHeader {
  readonly issuerName: string;
  readonly issuerNif: string;
  /** Incidencia técnica que impidió remitir a tiempo (OM art. 16.4; campo RemisionVoluntaria/Incidencia). */
  readonly incident: boolean;
}

const MAX_RECORDS = 1000;

/** RegFactuSistemaFacturacion: cabecera con el obligado y de 1 a 1.000 registros de ese mismo obligado. */
export function submissionXml(header: SubmissionHeader, records: readonly string[]): string {
  if (records.length === 0 || records.length > MAX_RECORDS) throw new RangeError("Un envío lleva entre 1 y 1.000 registros.");
  const incident = header.incident ? group("RemisionVoluntaria", leaf("Incidencia", "S")) : "";
  return [
    `<sfLR:RegFactuSistemaFacturacion xmlns:sfLR="${NAMESPACES.sfLR}" xmlns:sf="${NAMESPACES.sf}">`,
    `<sfLR:Cabecera>${group("ObligadoEmision", leaf("NombreRazon", header.issuerName), leaf("NIF", header.issuerNif))}${incident}</sfLR:Cabecera>`,
    ...records.map((record) => `<sfLR:RegistroFactura>${record}</sfLR:RegistroFactura>`),
    "</sfLR:RegFactuSistemaFacturacion>",
  ].join("");
}

/** Sobre SOAP 1.1, modo document/literal (apartado 4.2). */
export const soapEnvelope = (body: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="${NAMESPACES.soapenv}"><soapenv:Header/><soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`;
