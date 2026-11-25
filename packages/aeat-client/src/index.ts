// Remisión de registros VERI*FACTU a la AEAT (Fase 6; ADR-005): entornos, transporte SOAP con certificado,
// lectura de la respuesta oficial, control de flujo, certificados cifrados y simulador local.
export { checkCertificate, openCertificate, parseKek, sealCertificate } from "./certificates";
export { endpointFor, type Endpoint } from "./environment";
export { parseEnvelope, type DuplicateState, type ParsedEnvelope, type RecordState, type ResponseLine, type SubmissionResponse } from "./response";
export { INITIAL_WAIT_SECONDS, MAX_RECORDS_PER_SUBMISSION, nextSendDelaySeconds, retryDelaySeconds } from "./schedule";
export { createSimulator, type AeatSimulator, type SimulatorReply } from "./simulator";
export { recordStatus, submit, type RecordStatus, type SubmissionOutcome } from "./submission";
export { httpTransport, simulatorTransport, type Credentials, type Transport, type TransportResult } from "./transport";
