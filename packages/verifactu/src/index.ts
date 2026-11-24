// VERI*FACTU: registros de facturación, huella encadenada, XML oficial y QR (Fase 5). Funciones puras.
// Especificaciones oficiales versionadas en specs/1.0 (ver specs/README.md). Decisiones: ADR-004 y ADR-008.
export { aeatAmount, aeatDate, aeatPercent, generationTimestamp } from "./format";
export { altaHashInput, anulacionHashInput, fingerprint, type AltaHashFields, type AnulacionHashFields } from "./hash";
export { qrSvg, qrUrl, type QrEnvironment } from "./qr";
export {
  buildAlta,
  buildAnulacion,
  chainLinkOf,
  describeOperation,
  RECTIFICATION_TYPES,
  validateAlta,
  validateSoftware,
  type AltaData,
  type AltaRecord,
  type AnulacionRecord,
  type BillingRecord,
  type BillingSystemIdentity,
  type ChainLink,
  type InvoiceId,
  type InvoiceType,
  type RecordContext,
  type RectificationType,
  type Software,
} from "./record";
export { NAMESPACES, recordXml, soapEnvelope, submissionXml, type SubmissionHeader } from "./xml";
