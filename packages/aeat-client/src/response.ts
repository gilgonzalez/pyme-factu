// Respuesta de la AEAT a un envío (RespuestaSuministro.xsd 1.0; descripción de los servicios web v1.0.3,
// apartados 5.1 y 6.4.4): o la respuesta con el estado de cada registro, o un SOAP Fault.
import { xmlNode as node, xmlReader, type XmlNode as Node } from "./xml-reader";

export type RecordState = "Correcto" | "AceptadoConErrores" | "Incorrecto";
export type DuplicateState = "Correcta" | "AceptadaConErrores" | "Anulada";

export interface ResponseLine {
  readonly issuerNif: string;
  readonly number: string;
  /** Como viene en el XML: DD-MM-AAAA. */
  readonly issueDate: string;
  readonly operation: "Alta" | "Anulacion";
  readonly state: RecordState;
  readonly errorCode: string | null;
  readonly errorDescription: string | null;
  /** Solo si se rechazó por duplicado: estado del registro que la AEAT ya tenía. */
  readonly duplicateState: DuplicateState | null;
}

export interface SubmissionResponse {
  /** Código seguro de verificación: hay que guardarlo, no se puede recuperar después (apartado 6.4.4). */
  readonly csv: string | null;
  readonly waitSeconds: number;
  readonly globalState: "Correcto" | "ParcialmenteCorrecto" | "Incorrecto";
  readonly lines: readonly ResponseLine[];
}

export type ParsedEnvelope =
  | { readonly kind: "response"; readonly response: SubmissionResponse }
  | { readonly kind: "fault"; readonly code: string; readonly message: string }
  | { readonly kind: "unreadable" };

const parser = xmlReader("RespuestaLinea");
const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

function lineOf(raw: unknown): ResponseLine {
  const line = node(raw);
  const id = node(line["IDFactura"]);
  const duplicate = node(line["RegistroDuplicado"]);
  return {
    issuerNif: text(id["IDEmisorFactura"]) ?? "",
    number: text(id["NumSerieFactura"]) ?? "",
    issueDate: text(id["FechaExpedicionFactura"]) ?? "",
    operation: text(node(line["Operacion"])["TipoOperacion"]) === "Anulacion" ? "Anulacion" : "Alta",
    state: (text(line["EstadoRegistro"]) ?? "Incorrecto") as RecordState,
    errorCode: text(line["CodigoErrorRegistro"]),
    errorDescription: text(line["DescripcionErrorRegistro"]),
    duplicateState: text(duplicate["EstadoRegistroDuplicado"]) as DuplicateState | null,
  };
}

function responseOf(raw: Node): SubmissionResponse {
  const wait = Number(text(raw["TiempoEsperaEnvio"]));
  return {
    csv: text(raw["CSV"]),
    waitSeconds: Number.isInteger(wait) && wait >= 0 ? wait : 60,
    globalState: (text(raw["EstadoEnvio"]) ?? "Incorrecto") as SubmissionResponse["globalState"],
    lines: list(raw["RespuestaLinea"]).map(lineOf),
  };
}

/** Interpreta el cuerpo devuelto por el servicio. Nunca lanza: lo ilegible es «unreadable». */
export function parseEnvelope(xml: string): ParsedEnvelope {
  let body: Node;
  try {
    body = node(node(node(parser.parse(xml))["Envelope"])["Body"]);
  } catch {
    return { kind: "unreadable" };
  }
  if ("RespuestaRegFactuSistemaFacturacion" in body) return { kind: "response", response: responseOf(node(body["RespuestaRegFactuSistemaFacturacion"])) };
  if ("Fault" in body) {
    const fault = node(body["Fault"]);
    return { kind: "fault", code: text(fault["faultcode"]) ?? "", message: text(fault["faultstring"]) ?? "" };
  }
  return { kind: "unreadable" };
}
