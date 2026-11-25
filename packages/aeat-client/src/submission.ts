// Resultado de un envío y estado de cada registro. Estados internos (ADR-005); la respuesta oficial se conserva.
import { parseEnvelope, type ResponseLine, type SubmissionResponse } from "./response";
import type { Transport } from "./transport";

export type SubmissionOutcome =
  | { readonly kind: "answered"; readonly response: SubmissionResponse }
  /** Sin respuesta o error de la AEAT: se reenvía EL MISMO registro más tarde (nunca uno nuevo). */
  | { readonly kind: "retry"; readonly reason: string }
  /** El envío está mal (certificado, esquema…): no se arregla reintentando. */
  | { readonly kind: "attention"; readonly reason: string };

/** Apartado 5.1: Fault de servidor → reenviar; Fault de cliente → revisar; sin respuesta esperada → reenviar. */
export async function submit(transport: Transport, envelope: string): Promise<SubmissionOutcome> {
  let result;
  try {
    result = await transport(envelope);
  } catch (error) {
    return { kind: "retry", reason: `Sin conexión con la AEAT: ${error instanceof Error && error.message !== "" ? error.message : "error desconocido"}` };
  }
  const parsed = parseEnvelope(result.body);
  if (parsed.kind === "response") return { kind: "answered", response: parsed.response };
  if (parsed.kind === "fault" && parsed.code.endsWith("Client")) return { kind: "attention", reason: `La AEAT rechazó el envío: ${parsed.message}` };
  if (parsed.kind === "fault") return { kind: "retry", reason: `La AEAT no pudo procesar el envío (${parsed.message}).` };
  return { kind: "retry", reason: `Respuesta no reconocida de la AEAT (HTTP ${String(result.status)}).` };
}

export type RecordStatus = "ACCEPTED" | "ACCEPTED_WITH_ERRORS" | "REJECTED";

const DUPLICATE = "3000";

/**
 * Estado del registro según su línea de respuesta. Un duplicado (3000) de algo que la AEAT ya tiene correcto (o
 * aceptado con errores) es el reenvío de un registro cuya respuesta se perdió: ya está registrado.
 */
export function recordStatus(line: ResponseLine): { readonly status: RecordStatus; readonly errorCode: string | null; readonly errorDescription: string | null } {
  const detail = { errorCode: line.errorCode, errorDescription: line.errorDescription };
  if (line.state === "Correcto") return { status: "ACCEPTED", ...detail };
  if (line.state === "AceptadoConErrores") return { status: "ACCEPTED_WITH_ERRORS", ...detail };
  if (line.errorCode === DUPLICATE && line.duplicateState === "Correcta") return { status: "ACCEPTED", ...detail };
  if (line.errorCode === DUPLICATE && line.duplicateState === "AceptadaConErrores") return { status: "ACCEPTED_WITH_ERRORS", ...detail };
  return { status: "REJECTED", ...detail };
}
