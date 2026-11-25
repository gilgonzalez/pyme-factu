// VERI*FACTU en la base de datos (Fase 5; ADR-004 y ADR-008): cada contribuyente tiene una «facturación» con UNA
// cadena de registros de alta y anulación. Un registro se añade al final de la cadena dentro de la transacción de
// quien lo origina (emitir o anular), con la cadena bloqueada: dos operaciones simultáneas nunca la bifurcan.
import type { Database, Tx } from "@facturalibre/database";
import {
  buildAlta,
  buildAnulacion,
  checkChain,
  describeOperation,
  generationTimestamp,
  recordXml,
  RECTIFICATION_TYPES,
  validateAlta,
  type AltaData,
  type BillingRecord,
  type ChainLink,
  type InvoiceId,
  type RecordCheck,
  type RecordContext,
  type Software,
  type StoredRecord,
} from "@facturalibre/verifactu";
import { recordAudit } from "./audit";
import { activeTaxpayerId } from "./catalog";
import { formatInvoiceNumber, isoDate, lockInvoice, totalsOfStored, type Kind } from "./invoice-shared";
import { runInTenant } from "./run-in-tenant";
import type { TenantContext } from "./tenant-context";

/** Configuración del despliegue: identidad del sistema informático de facturación (ADR-008, decisión 10). */
export interface VerifactuSettings {
  readonly software: Software;
}

// ─── Cadena ──────────────────────────────────────────────────────────────────

interface SystemState {
  readonly id: string;
  readonly lastSequence: number;
}

/** Facturación del contribuyente (se crea la primera vez), bloqueada hasta el final de la transacción. */
async function lockBillingSystem(tx: Tx, context: TenantContext, taxpayerId: string): Promise<SystemState> {
  await tx.billingSystem.createMany({ data: [{ tenantId: context.tenant.id, taxpayerId }], skipDuplicates: true });
  const [row] = await tx.$queryRaw<{ id: string; last_sequence: number }[]>`
    SELECT id, last_sequence FROM billing_systems WHERE taxpayer_id = ${taxpayerId}::uuid FOR UPDATE`;
  if (row === undefined) throw new Error("La facturación del contribuyente no es visible.");
  return { id: row.id, lastSequence: row.last_sequence };
}

async function previousLink(tx: Tx, system: SystemState): Promise<ChainLink | null> {
  if (system.lastSequence === 0) return null;
  const row = await tx.billingRecord.findFirstOrThrow({
    where: { billingSystemId: system.id, sequence: system.lastSequence },
    select: { issuerNif: true, invoiceNumber: true, issueDate: true, hash: true },
  });
  return { issuerNif: row.issuerNif, number: row.invoiceNumber, issueDate: isoDate(row.issueDate), hash: row.hash };
}

/**
 * Contexto del nuevo registro. La fecha-hora sale del reloj de la BD DESPUÉS de bloquear la cadena
 * (clock_timestamp, no now()): así el orden de la secuencia es también el cronológico (OM art. 7.a).
 */
async function recordContext(tx: Tx, settings: VerifactuSettings, system: SystemState): Promise<RecordContext> {
  const [clock] = await tx.$queryRaw<{ now: Date; multiple: boolean }[]>`SELECT clock_timestamp() AS now, app.tenant_has_multiple_taxpayers() AS multiple`;
  return {
    previous: await previousLink(tx, system),
    system: { installationNumber: system.id, multipleTaxpayers: clock?.multiple === true },
    software: settings.software,
    generatedAt: generationTimestamp(clock?.now ?? new Date()),
  };
}

const invoiceIdOf = (record: BillingRecord): InvoiceId => (record.kind === "ALTA" ? record.data.invoice : record.invoice);

/** Añade al final de la cadena el registro que construye `build`. La BD vuelve a comprobar el enlace (trigger). */
async function appendRecord(
  tx: Tx,
  context: TenantContext,
  taxpayerId: string,
  invoiceId: string,
  settings: VerifactuSettings,
  build: (recordCtx: RecordContext) => BillingRecord,
): Promise<void> {
  const system = await lockBillingSystem(tx, context, taxpayerId);
  const record = build(await recordContext(tx, settings, system));
  const sequence = system.lastSequence + 1;
  const invoice = invoiceIdOf(record);
  const alta = record.kind === "ALTA" ? record : null;
  await tx.billingRecord.createMany({
    data: [
      {
        tenantId: context.tenant.id,
        taxpayerId,
        billingSystemId: system.id,
        sequence,
        kind: record.kind,
        invoiceId,
        issuerNif: invoice.issuerNif,
        invoiceNumber: invoice.number,
        issueDate: new Date(`${invoice.issueDate}T00:00:00Z`),
        invoiceType: alta?.data.type ?? null,
        cuotaTotal: alta?.cuotaTotal ?? null,
        importeTotal: alta?.importeTotal ?? null,
        previousHash: record.context.previous?.hash ?? null,
        hash: record.hash,
        generatedAt: record.context.generatedAt,
        xml: recordXml(record),
        createdByUserId: context.user.id,
      },
    ],
  });
  await tx.billingSystem.updateMany({ where: { id: system.id }, data: { lastSequence: sequence } });
}

// ─── Alta (al emitir) ────────────────────────────────────────────────────────

export type Registrable = { readonly ok: true; readonly data: AltaData } | { readonly ok: false; readonly errors: Readonly<Record<string, string>> };

const PARTY = { nif: true, legalName: true } as const;

async function rectifiedIds(tx: Tx, taxpayerId: string, issuerNif: string, rectifiesInvoiceId: string | null): Promise<InvoiceId[]> {
  if (rectifiesInvoiceId === null) return [];
  const row = await tx.invoice.findFirstOrThrow({
    where: { id: rectifiesInvoiceId, taxpayerId },
    select: { number: true, issueDate: true, series: { select: { code: true } } },
  });
  if (row.number === null || row.issueDate === null) return [];
  return [{ issuerNif, number: formatInvoiceNumber(row.series.code, row.number), issueDate: isoDate(row.issueDate) }];
}

function invoiceTypeOf(kind: Kind, code: string | null): AltaData["type"] | null {
  if (kind === "STANDARD") return "F1";
  return RECTIFICATION_TYPES.find((candidate) => candidate === code) ?? null;
}

/**
 * Datos del registro de alta de un borrador que se va a expedir con `number` y `issueDate`, o los motivos por
 * los que la AEAT lo rechazaría (en ese caso no se emite: ADR-008).
 */
export async function altaDataFor(tx: Tx, taxpayerId: string, invoiceId: string, number: string, issueDate: string): Promise<Registrable> {
  const invoice = await tx.invoice.findFirstOrThrow({
    where: { id: invoiceId, taxpayerId },
    select: {
      kind: true,
      rectificationCode: true,
      rectifiesInvoiceId: true,
      equivalenceSurcharge: true,
      withholdingPercent: true,
      customer: { select: PARTY },
      lines: { orderBy: { position: "asc" }, select: { description: true, quantity: true, unitPrice: true, discountPercent: true, taxKey: true } },
    },
  });
  const issuer = await tx.taxpayer.findFirstOrThrow({ where: { id: taxpayerId }, select: PARTY });
  const type = invoiceTypeOf(invoice.kind, invoice.rectificationCode);
  if (type === null) return { ok: false, errors: { code: "Elige el tipo de rectificación antes de emitir." } };
  const data: AltaData = {
    invoice: { issuerNif: issuer.nif, number, issueDate },
    issuerName: issuer.legalName,
    type,
    rectified: await rectifiedIds(tx, taxpayerId, issuer.nif, invoice.rectifiesInvoiceId),
    description: describeOperation(invoice.lines.map((line) => line.description)),
    recipient: { name: invoice.customer.legalName, nif: invoice.customer.nif },
    details: totalsOfStored(invoice.lines, invoice.equivalenceSurcharge, invoice.withholdingPercent).breakdown,
  };
  const errors = validateAlta(data);
  return Object.keys(errors).length === 0 ? { ok: true, data } : { ok: false, errors };
}

/** Registro de alta de la factura que se está emitiendo (en la MISMA transacción que la emisión). */
export const registerAlta = (tx: Tx, context: TenantContext, taxpayerId: string, invoiceId: string, data: AltaData, settings: VerifactuSettings): Promise<void> =>
  appendRecord(tx, context, taxpayerId, invoiceId, settings, (recordCtx) => buildAlta(data, recordCtx));

// ─── Anulación ───────────────────────────────────────────────────────────────

export type AnnulResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "NOT_FOUND" | "NOT_ISSUED" | "NOT_REGISTERED" | "ALREADY_ANNULLED" }
  | { readonly ok: false; readonly reason: "INVALID"; readonly errors: Readonly<Record<string, string>> };

const ANNUL_REASON_MAX = 500;

/**
 * Anula una factura expedida por error (no hubo operación real): encadena un registro de anulación (OM art. 11).
 * Si hubo operación y hay que corregirla, lo que procede es una rectificativa, no esto.
 */
export function annulInvoice(db: Database, context: TenantContext, invoiceId: string, raw: { readonly reason?: unknown }, settings: VerifactuSettings): Promise<AnnulResult> {
  return runInTenant(db, context, "invoices.rectify", async (tx): Promise<AnnulResult> => {
    const taxpayerId = activeTaxpayerId(context, "invoices.rectify");
    const current = await lockInvoice(tx, taxpayerId, invoiceId);
    if (current === null) return { ok: false, reason: "NOT_FOUND" };
    if (current.status !== "ISSUED") return { ok: false, reason: "NOT_ISSUED" };
    const records = await tx.billingRecord.findMany({ where: { invoiceId, taxpayerId }, select: { kind: true, issuerNif: true, invoiceNumber: true, issueDate: true } });
    const alta = records.find((record) => record.kind === "ALTA");
    if (alta === undefined) return { ok: false, reason: "NOT_REGISTERED" };
    if (records.some((record) => record.kind === "ANULACION")) return { ok: false, reason: "ALREADY_ANNULLED" };
    const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
    if (reason === "" || reason.length > ANNUL_REASON_MAX) return { ok: false, reason: "INVALID", errors: { reason: "Explica por qué se anula la factura." } };
    const annulled = { issuerNif: alta.issuerNif, number: alta.invoiceNumber, issueDate: isoDate(alta.issueDate) };
    await appendRecord(tx, context, taxpayerId, invoiceId, settings, (recordCtx) => buildAnulacion(annulled, recordCtx));
    await recordAudit(tx, context, "invoice.annulled", { type: "invoice", id: invoiceId }, { reason });
    return { ok: true };
  });
}

// ─── Consulta ────────────────────────────────────────────────────────────────

/** Un registro conservado (campos de su huella y de su enlace) con su factura y el estado de su remisión. */
export interface BillingRecordView extends StoredRecord {
  readonly id: string;
  readonly invoiceId: string;
  readonly status: "PENDING" | "ACCEPTED" | "ACCEPTED_WITH_ERRORS" | "REJECTED";
  readonly submittedAt: Date | null;
  readonly aeatCsv: string | null;
  readonly aeatErrorCode: string | null;
  readonly aeatErrorDescription: string | null;
}

const RECORD_FIELDS = {
  id: true,
  sequence: true,
  kind: true,
  invoiceId: true,
  issuerNif: true,
  invoiceNumber: true,
  issueDate: true,
  invoiceType: true,
  cuotaTotal: true,
  importeTotal: true,
  previousHash: true,
  hash: true,
  generatedAt: true,
  status: true,
  submittedAt: true,
  aeatCsv: true,
  aeatErrorCode: true,
  aeatErrorDescription: true,
} as const;

const viewOf = <T extends { readonly issueDate: Date }>(row: T): Omit<T, "issueDate"> & { issueDate: string } => ({ ...row, issueDate: isoDate(row.issueDate) });

/** Cadena completa del contribuyente activo, con la comprobación de cada registro (huella y enlace). */
export function listBillingRecords(db: Database, context: TenantContext): Promise<{ readonly records: BillingRecordView[]; readonly checks: RecordCheck[] }> {
  return runInTenant(db, context, "verifactu.read", async (tx) => {
    const rows = await tx.billingRecord.findMany({
      where: { taxpayerId: activeTaxpayerId(context, "verifactu.read") },
      select: RECORD_FIELDS,
      orderBy: { sequence: "asc" },
    });
    const records = rows.map(viewOf);
    return { records, checks: checkChain(records) };
  });
}

export interface InvoiceRecords {
  readonly alta: BillingRecordView | null;
  readonly anulacion: BillingRecordView | null;
}

/** Registros de una factura (su ficha, su QR y si está anulada). */
export async function invoiceRecords(tx: Tx, taxpayerId: string, invoiceId: string): Promise<InvoiceRecords> {
  const rows = (await tx.billingRecord.findMany({ where: { invoiceId, taxpayerId }, select: RECORD_FIELDS })).map(viewOf);
  return { alta: rows.find((row) => row.kind === "ALTA") ?? null, anulacion: rows.find((row) => row.kind === "ANULACION") ?? null };
}

// ─── Estado de la remisión (Fase 6) ──────────────────────────────────────────

export interface SubmissionStatus {
  readonly pending: number;
  readonly rejected: number;
  /** Desde cuándo una incidencia impide remitir (null = sin incidencia): mientras dure se avisa (OM art. 16.4). */
  readonly failingSince: Date | null;
  readonly lastError: string | null;
}

/** Cuántos registros faltan por remitir o fueron rechazados, y la incidencia en curso si la hay. */
export function submissionStatus(db: Database, context: TenantContext): Promise<SubmissionStatus> {
  return runInTenant(db, context, "verifactu.read", async (tx) => {
    const taxpayerId = activeTaxpayerId(context, "verifactu.read");
    const [pending, rejected, system] = await Promise.all([
      tx.billingRecord.count({ where: { taxpayerId, status: "PENDING" } }),
      tx.billingRecord.count({ where: { taxpayerId, status: "REJECTED" } }),
      tx.billingSystem.findUnique({ where: { taxpayerId }, select: { failingSince: true, lastError: true } }),
    ]);
    return { pending, rejected, failingSince: system?.failingSince ?? null, lastError: system?.lastError ?? null };
  });
}
