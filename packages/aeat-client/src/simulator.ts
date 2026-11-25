// Simulador local del servicio VERI*FACTU de la AEAT, para desarrollo y pruebas (R-19: desde desarrollo nunca se
// envía a la AEAT real). Responde con el formato oficial (RespuestaSuministro.xsd 1.0) y con códigos del catálogo
// oficial (errores.properties): recalcula la huella (2000), detecta duplicados (3000) y anulaciones de registros
// inexistentes (3002). No sustituye al portal de pruebas externas de la AEAT.
import { randomBytes } from "node:crypto";
import { altaHashInput, anulacionHashInput, fingerprint, generationTimestamp, NAMESPACES } from "@facturalibre/verifactu";
import type { DuplicateState, RecordState } from "./response";
import { xmlNode as node, xmlReader, type XmlNode as Node } from "./xml-reader";

const parser = xmlReader("RegistroFactura");
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const escapeXml = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const ERRORS = {
  "2000": "El cálculo de la huella suministrada es incorrecta.",
  "3000": "Registro de facturación duplicado.",
  "3002": "No existe el registro de facturación.",
} as const;
type ErrorCode = keyof typeof ERRORS;

interface Outcome {
  readonly issuerNif: string;
  readonly number: string;
  readonly issueDate: string;
  readonly operation: "Alta" | "Anulacion";
  readonly state: RecordState;
  readonly error: ErrorCode | null;
  readonly duplicateState: DuplicateState | null;
}

export interface SimulatorReply {
  readonly status: number;
  readonly body: string;
}

export interface AeatSimulator {
  handle(envelope: string): SimulatorReply;
}

const previousHash = (record: Node): string => text(node(node(record["Encadenamiento"])["RegistroAnterior"])["Huella"]);

function altaHash(record: Node): boolean {
  const id = node(record["IDFactura"]);
  const expected = fingerprint(
    altaHashInput({
      issuerNif: text(id["IDEmisorFactura"]),
      invoiceNumber: text(id["NumSerieFactura"]),
      issueDate: text(id["FechaExpedicionFactura"]),
      invoiceType: text(record["TipoFactura"]),
      cuotaTotal: text(record["CuotaTotal"]),
      importeTotal: text(record["ImporteTotal"]),
      previousHash: previousHash(record),
      generatedAt: text(record["FechaHoraHusoGenRegistro"]),
    }),
  );
  return expected === text(record["Huella"]);
}

function anulacionHash(record: Node): boolean {
  const id = node(record["IDFactura"]);
  const expected = fingerprint(
    anulacionHashInput({
      issuerNif: text(id["IDEmisorFacturaAnulada"]),
      invoiceNumber: text(id["NumSerieFacturaAnulada"]),
      issueDate: text(id["FechaExpedicionFacturaAnulada"]),
      previousHash: previousHash(record),
      generatedAt: text(record["FechaHoraHusoGenRegistro"]),
    }),
  );
  return expected === text(record["Huella"]);
}

const accepted = (hashOk: boolean): { state: RecordState; error: ErrorCode | null } => (hashOk ? { state: "Correcto", error: null } : { state: "AceptadoConErrores", error: "2000" });

function processAlta(registry: Map<string, DuplicateState>, record: Node): Outcome {
  const id = node(record["IDFactura"]);
  const key = { issuerNif: text(id["IDEmisorFactura"]), number: text(id["NumSerieFactura"]), issueDate: text(id["FechaExpedicionFactura"]) };
  const registryKey = `${key.issuerNif}|${key.number}|${key.issueDate}`;
  const existing = registry.get(registryKey);
  if (existing !== undefined) return { ...key, operation: "Alta", state: "Incorrecto", error: "3000", duplicateState: existing };
  const result = accepted(altaHash(record));
  registry.set(registryKey, result.state === "Correcto" ? "Correcta" : "AceptadaConErrores");
  return { ...key, operation: "Alta", ...result, duplicateState: null };
}

function processAnulacion(registry: Map<string, DuplicateState>, record: Node): Outcome {
  const id = node(record["IDFactura"]);
  const key = { issuerNif: text(id["IDEmisorFacturaAnulada"]), number: text(id["NumSerieFacturaAnulada"]), issueDate: text(id["FechaExpedicionFacturaAnulada"]) };
  const registryKey = `${key.issuerNif}|${key.number}|${key.issueDate}`;
  if (!registry.has(registryKey)) return { ...key, operation: "Anulacion", state: "Incorrecto", error: "3002", duplicateState: null };
  registry.set(registryKey, "Anulada");
  return { ...key, operation: "Anulacion", ...accepted(anulacionHash(record)), duplicateState: null };
}

function lineXml(outcome: Outcome): string {
  const error = outcome.error === null ? "" : `<sfR:CodigoErrorRegistro>${outcome.error}</sfR:CodigoErrorRegistro><sfR:DescripcionErrorRegistro>${ERRORS[outcome.error]}</sfR:DescripcionErrorRegistro>`;
  const duplicate =
    outcome.duplicateState === null
      ? ""
      : `<sfR:RegistroDuplicado><sf:IdPeticionRegistroDuplicado>SIMULADOR</sf:IdPeticionRegistroDuplicado><sf:EstadoRegistroDuplicado>${outcome.duplicateState}</sf:EstadoRegistroDuplicado></sfR:RegistroDuplicado>`;
  return [
    "<sfR:RespuestaLinea><sfR:IDFactura>",
    `<sf:IDEmisorFactura>${escapeXml(outcome.issuerNif)}</sf:IDEmisorFactura><sf:NumSerieFactura>${escapeXml(outcome.number)}</sf:NumSerieFactura><sf:FechaExpedicionFactura>${escapeXml(outcome.issueDate)}</sf:FechaExpedicionFactura>`,
    `</sfR:IDFactura><sfR:Operacion><sf:TipoOperacion>${outcome.operation}</sf:TipoOperacion></sfR:Operacion>`,
    `<sfR:EstadoRegistro>${outcome.state}</sfR:EstadoRegistro>${error}${duplicate}</sfR:RespuestaLinea>`,
  ].join("");
}

function globalState(outcomes: readonly Outcome[]): string {
  if (outcomes.every((outcome) => outcome.state === "Correcto")) return "Correcto";
  return outcomes.every((outcome) => outcome.state === "Incorrecto") ? "Incorrecto" : "ParcialmenteCorrecto";
}

const envelope = (body: string): string => `<?xml version="1.0" encoding="UTF-8"?><env:Envelope xmlns:env="${NAMESPACES.soapenv}"><env:Body>${body}</env:Body></env:Envelope>`;

const fault = (message: string): SimulatorReply => ({
  status: 500,
  body: envelope(`<env:Fault><faultcode>env:Client</faultcode><faultstring>${escapeXml(message)}</faultstring></env:Fault>`),
});

function responseXml(header: Node, outcomes: readonly Outcome[], waitSeconds: number): string {
  const obligado = node(header["ObligadoEmision"]);
  const nif = escapeXml(text(obligado["NIF"]));
  const csv = outcomes.some((outcome) => outcome.state !== "Incorrecto") ? `<sfR:CSV>${randomBytes(8).toString("hex").toUpperCase()}</sfR:CSV>` : "";
  return [
    `<sfR:RespuestaRegFactuSistemaFacturacion xmlns:sfR="${NAMESPACES.sfR}" xmlns:sf="${NAMESPACES.sf}">`,
    csv,
    `<sfR:DatosPresentacion><sf:NIFPresentador>${nif}</sf:NIFPresentador><sf:TimestampPresentacion>${generationTimestamp(new Date())}</sf:TimestampPresentacion></sfR:DatosPresentacion>`,
    `<sfR:Cabecera><sf:ObligadoEmision><sf:NombreRazon>${escapeXml(text(obligado["NombreRazon"]))}</sf:NombreRazon><sf:NIF>${nif}</sf:NIF></sf:ObligadoEmision></sfR:Cabecera>`,
    `<sfR:TiempoEsperaEnvio>${String(waitSeconds)}</sfR:TiempoEsperaEnvio><sfR:EstadoEnvio>${globalState(outcomes)}</sfR:EstadoEnvio>`,
    ...outcomes.map(lineXml),
    "</sfR:RespuestaRegFactuSistemaFacturacion>",
  ].join("");
}

/** Simulador con memoria propia: lo ya registrado sigue registrado en los envíos siguientes. */
export function createSimulator(waitSeconds = 60): AeatSimulator {
  const registry = new Map<string, DuplicateState>();
  return {
    handle(request) {
      let parsed: Node;
      try {
        parsed = node(parser.parse(request));
      } catch {
        return fault("4103 = Se ha producido un error inesperado al parsear el XML.");
      }
      const submission = node(node(node(parsed["Envelope"])["Body"])["RegFactuSistemaFacturacion"]);
      const records = submission["RegistroFactura"];
      if (!Array.isArray(records)) return fault("4102 = El XML no cumple el esquema. Falta informar campo obligatorio.");
      const outcomes = records.map((raw: unknown) => {
        const entry = node(raw);
        return "RegistroAnulacion" in entry ? processAnulacion(registry, node(entry["RegistroAnulacion"])) : processAlta(registry, node(entry["RegistroAlta"]));
      });
      return { status: 200, body: envelope(responseXml(node(submission["Cabecera"]), outcomes, waitSeconds)) };
    },
  };
}
