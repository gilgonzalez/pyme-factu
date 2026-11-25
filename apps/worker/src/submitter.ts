// Remisión de los registros VERI*FACTU a la AEAT (Fase 6; OM HAC/1177/2024, art. 16; ADR-005).
// Cada ciclo reclama una facturación con registros pendientes cuyo turno ha llegado (control de flujo o
// reintento), envía hasta 1.000 en orden y aplica la respuesta registro a registro. Un reintento reenvía
// EXACTAMENTE los mismos registros (el XML guardado), nunca unos nuevos.
import {
  endpointFor,
  httpTransport,
  MAX_RECORDS_PER_SUBMISSION,
  nextSendDelaySeconds,
  openCertificate,
  recordStatus,
  retryDelaySeconds,
  submit,
  type SubmissionResponse,
  type Transport,
} from "@facturalibre/aeat-client";
import type { Database } from "@facturalibre/database";
import { aeatDate, soapEnvelope, submissionXml } from "@facturalibre/verifactu";

/** Transporte para remitir los registros de un contribuyente, o por qué no se puede. */
export type TransportChoice = { readonly ok: true; readonly transport: Transport } | { readonly ok: false; readonly reason: string };
export type TransportResolver = (taxpayerId: string) => Promise<TransportChoice>;

/** Mientras un worker envía, la facturación queda reservada (si el proceso muere, otro la retoma después). */
const LEASE_SECONDS = 300;
/** Lo que no se arregla reintentando (falta el certificado, envío mal formado…): se vuelve a intentar cada hora. */
const ATTENTION_SECONDS = 3600;

interface Claimed {
  readonly id: string;
  readonly taxpayerId: string;
}

async function claimDue(db: Database): Promise<Claimed | null> {
  const [row] = await db.$queryRaw<{ id: string; taxpayer_id: string }[]>`
    UPDATE billing_systems SET next_send_at = now() + make_interval(secs => ${LEASE_SECONDS})
    WHERE id = (
      SELECT bs.id FROM billing_systems bs
      WHERE (bs.next_send_at IS NULL OR bs.next_send_at <= now())
        AND EXISTS (SELECT 1 FROM billing_records r WHERE r.billing_system_id = bs.id AND r.status = 'PENDING')
      ORDER BY bs.next_send_at NULLS FIRST
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, taxpayer_id`;
  return row === undefined ? null : { id: row.id, taxpayerId: row.taxpayer_id };
}

const PENDING_FIELDS = { id: true, kind: true, invoiceNumber: true, issueDate: true, xml: true } as const;
type Pending = { readonly id: string; readonly kind: "ALTA" | "ANULACION"; readonly invoiceNumber: string; readonly issueDate: Date; readonly xml: string };

const secondsFrom = (now: Date, seconds: number): Date => new Date(now.getTime() + seconds * 1000);

/** Respuesta de la AEAT: estado de cada registro y siguiente turno según el control de flujo. */
async function applyResponse(db: Database, systemId: string, records: readonly Pending[], response: SubmissionResponse, submittedAt: Date): Promise<void> {
  for (const record of records) {
    const operation = record.kind === "ALTA" ? "Alta" : "Anulacion";
    const issueDate = aeatDate(record.issueDate.toISOString().slice(0, 10));
    const line = response.lines.find((candidate) => candidate.number === record.invoiceNumber && candidate.issueDate === issueDate && candidate.operation === operation);
    const result = line === undefined ? null : recordStatus(line);
    await db.billingRecord.update({
      where: { id: record.id },
      data:
        result === null
          ? { attempts: { increment: 1 } }
          : {
              attempts: { increment: 1 },
              status: result.status,
              submittedAt,
              aeatCsv: result.status === "REJECTED" ? null : response.csv,
              aeatErrorCode: result.errorCode,
              aeatErrorDescription: result.errorDescription,
            },
    });
  }
  const remaining = await db.billingRecord.count({ where: { billingSystemId: systemId, status: "PENDING" } });
  await db.billingSystem.update({
    where: { id: systemId },
    data: {
      waitSeconds: response.waitSeconds,
      nextSendAt: secondsFrom(new Date(), nextSendDelaySeconds(response.waitSeconds, remaining)),
      consecutiveFailures: 0,
      failingSince: null,
      lastError: null,
    },
  });
}

/** Sin respuesta útil: los registros siguen pendientes y se avisa de la incidencia hasta que se remitan. */
async function recordIncident(db: Database, systemId: string, records: readonly Pending[], reason: string, delaySeconds: (failures: number) => number): Promise<void> {
  const now = new Date();
  const system = await db.billingSystem.findUniqueOrThrow({ where: { id: systemId }, select: { consecutiveFailures: true, failingSince: true } });
  const failures = system.consecutiveFailures + 1;
  if (records.length > 0) await db.billingRecord.updateMany({ where: { id: { in: records.map((record) => record.id) } }, data: { attempts: { increment: 1 } } });
  await db.billingSystem.update({
    where: { id: systemId },
    data: { consecutiveFailures: failures, failingSince: system.failingSince ?? now, lastError: reason, nextSendAt: secondsFrom(now, delaySeconds(failures)) },
  });
}

async function processSystem(db: Database, claimed: Claimed, resolveTransport: TransportResolver): Promise<void> {
  const records = await db.billingRecord.findMany({
    where: { billingSystemId: claimed.id, status: "PENDING" },
    orderBy: { sequence: "asc" },
    take: MAX_RECORDS_PER_SUBMISSION,
    select: PENDING_FIELDS,
  });
  const choice = await resolveTransport(claimed.taxpayerId);
  if (!choice.ok) {
    await recordIncident(db, claimed.id, [], choice.reason, () => ATTENTION_SECONDS);
    return;
  }
  const taxpayer = await db.taxpayer.findUniqueOrThrow({ where: { id: claimed.taxpayerId }, select: { nif: true, legalName: true } });
  const { failingSince } = await db.billingSystem.findUniqueOrThrow({ where: { id: claimed.id }, select: { failingSince: true } });
  const header = { issuerName: taxpayer.legalName, issuerNif: taxpayer.nif, incident: failingSince !== null };
  const submittedAt = new Date();
  const outcome = await submit(choice.transport, soapEnvelope(submissionXml(header, records.map((record) => record.xml))));
  if (outcome.kind === "answered") await applyResponse(db, claimed.id, records, outcome.response, submittedAt);
  else await recordIncident(db, claimed.id, records, outcome.reason, outcome.kind === "retry" ? retryDelaySeconds : () => ATTENTION_SECONDS);
}

/** Procesa las facturaciones cuyo turno ha llegado (como mucho `limit`); devuelve cuántas. */
export async function runSubmissionCycle(db: Database, resolveTransport: TransportResolver, limit = 20): Promise<number> {
  let processed = 0;
  while (processed < limit) {
    const claimed = await claimDue(db);
    if (claimed === null) break;
    await processSystem(db, claimed, resolveTransport);
    processed += 1;
  }
  return processed;
}

/**
 * Transporte según el entorno (R-19): fuera de producción y pruebas, el simulador local; si no, HTTPS con el
 * certificado del contribuyente, descifrado solo en memoria y solo para este envío.
 */
export function transportResolver(db: Database, environment: string | undefined, kek: Buffer | null, simulator: Transport): TransportResolver {
  const endpoint = endpointFor(environment);
  return async (taxpayerId) => {
    if (endpoint.kind === "simulator") return { ok: true, transport: simulator };
    if (kek === null) return { ok: false, reason: "Falta CERTIFICATE_KEK: no se pueden usar los certificados para remitir a la AEAT." };
    const certificate = await db.taxpayerCertificate.findUnique({ where: { taxpayerId }, select: { sealed: true } });
    if (certificate === null) return { ok: false, reason: "Falta el certificado electrónico del contribuyente para remitir a la AEAT." };
    return { ok: true, transport: httpTransport(endpoint.url, openCertificate(kek, certificate.sealed)) };
  };
}
