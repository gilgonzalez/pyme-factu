// Facturas: borradores, emisión con numeración correlativa sin huecos y rectificativas por diferencias.
// Cálculos: @facturalibre/fiscal-core (ADR-007). Inmutabilidad de lo emitido: triggers de la BD.
import { randomUUID } from "node:crypto";
import type { Database, Tx } from "@facturalibre/database";
import {
  calculateInvoice,
  parseDecimal,
  parseInvoiceLine,
  parseTaxCategory,
  SCALE,
  taxCategoryKey,
  type InvoiceTotals,
  type ParsedLine,
  type TaxBreakdown,
} from "@facturalibre/fiscal-core";
import { RECTIFICATION_TYPES } from "@facturalibre/verifactu";
import { recordAudit } from "./audit";
import { addDays, issuerProfile } from "./billing-settings";
import { activeTaxpayerId } from "./catalog";
import { formatInvoiceNumber, isoDate, lockInvoice, totalsOfStored, UUID, type Kind } from "./invoice-shared";
import { runInTenant } from "./run-in-tenant";
import type { TenantContext } from "./tenant-context";
import { altaDataFor, invoiceRecords, registerAlta, type InvoiceRecords, type VerifactuSettings } from "./verifactu";

export { formatInvoiceNumber } from "./invoice-shared";

type Raw = Readonly<Record<string, unknown>>;
type Invalid = { readonly ok: false; readonly reason: "INVALID"; readonly errors: Readonly<Record<string, string>> };

const HUNDRED_PERCENT = 10_000n;
const NOTES_MAX = 1000;

// ─── Series automáticas por año: F{año} ordinarias, R{año} rectificativas ──────

const seriesCode = (kind: Kind, year: string): string => `${kind === "STANDARD" ? "F" : "R"}${year}`;

/** Fecha de hoy en España (Europe/Madrid), según el reloj de la base de datos. */
async function todayInSpain(tx: Tx): Promise<string> {
  const [row] = await tx.$queryRaw<{ today: string }[]>`SELECT to_char(now() AT TIME ZONE 'Europe/Madrid', 'YYYY-MM-DD') AS today`;
  return row?.today ?? new Date().toISOString().slice(0, 10);
}

/** Serie del año para el tipo de factura; se crea la primera vez (idempotente ante concurrencia). */
async function seriesFor(tx: Tx, context: TenantContext, taxpayerId: string, kind: Kind, year: string): Promise<{ id: string; code: string }> {
  const code = seriesCode(kind, year);
  await tx.invoiceSeries.createMany({ data: [{ tenantId: context.tenant.id, taxpayerId, code, kind }], skipDuplicates: true });
  return tx.invoiceSeries.findFirstOrThrow({ where: { taxpayerId, code }, select: { id: true, code: true } });
}

// ─── Entrada de borradores ───────────────────────────────────────────────────

interface DraftInput {
  readonly customer: { readonly id: string; readonly equivalenceSurcharge: boolean };
  readonly lines: readonly ParsedLine[];
  readonly withholdingPercent: bigint;
  readonly notes: string | null;
}

function parseLines(raw: unknown, errors: Record<string, string>): ParsedLine[] {
  const rows: unknown[] = Array.isArray(raw) ? raw : [];
  if (rows.length === 0) errors["lines"] = "Añade al menos una línea.";
  const lines: ParsedLine[] = [];
  rows.forEach((row, index) => {
    const parsed = parseInvoiceLine(typeof row === "object" && row !== null ? row : {});
    if (parsed.ok) lines.push(parsed.value);
    else for (const [field, message] of Object.entries(parsed.errors)) errors[`lines.${String(index)}.${field}`] = message;
  });
  return lines;
}

function parseWithholding(raw: unknown, errors: Record<string, string>): bigint {
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) return 0n;
  const parsed = parseDecimal(raw, SCALE.percent);
  if (parsed.ok && parsed.value <= HUNDRED_PERCENT) return parsed.value;
  errors["withholdingPercent"] = "La retención debe estar entre 0 y 100 %.";
  return 0n;
}

function parseNotes(raw: unknown, errors: Record<string, string>): string | null {
  const notes = typeof raw === "string" ? raw.trim() : "";
  if (notes.length > NOTES_MAX) errors["notes"] = `Las observaciones no pueden superar los ${String(NOTES_MAX)} caracteres.`;
  return notes === "" ? null : notes;
}

async function parseDraft(tx: Tx, taxpayerId: string, raw: Raw): Promise<{ ok: true; value: DraftInput } | Invalid> {
  const errors: Record<string, string> = {};
  const customerId = raw["customerId"];
  const customer =
    typeof customerId === "string" && UUID.test(customerId)
      ? await tx.customer.findFirst({ where: { id: customerId, taxpayerId }, select: { id: true, equivalenceSurcharge: true } })
      : null;
  if (customer === null) errors["customerId"] = "Elige un cliente.";
  const lines = parseLines(raw["lines"], errors);
  const withholdingPercent = parseWithholding(raw["withholdingPercent"], errors);
  const notes = parseNotes(raw["notes"], errors);
  if (customer === null || Object.keys(errors).length > 0) return { ok: false, reason: "INVALID", errors };
  return { ok: true, value: { customer, lines, withholdingPercent, notes } };
}

const totalsOf = (input: DraftInput): InvoiceTotals =>
  calculateInvoice({ lines: input.lines, equivalenceSurcharge: input.customer.equivalenceSurcharge, withholdingPercent: input.withholdingPercent });

function invoiceAmounts(input: DraftInput) {
  const totals = totalsOf(input);
  return {
    customerId: input.customer.id,
    equivalenceSurcharge: input.customer.equivalenceSurcharge,
    withholdingPercent: Number(input.withholdingPercent),
    notes: input.notes,
    taxableBase: totals.taxableBase,
    vatTotal: totals.vatTotal,
    surchargeTotal: totals.surchargeTotal,
    withholdingAmount: totals.withholdingAmount,
    total: totals.total,
  };
}

async function writeLines(tx: Tx, context: TenantContext, taxpayerId: string, invoiceId: string, input: DraftInput): Promise<void> {
  const totals = totalsOf(input);
  await tx.invoiceLine.createMany({
    data: input.lines.map((line, index) => ({
      tenantId: context.tenant.id,
      taxpayerId,
      invoiceId,
      position: index + 1,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: Number(line.discountPercent),
      taxKey: taxCategoryKey(line.tax),
      lineBase: totals.lineBases[index] ?? 0n,
    })),
  });
}

// ─── Borradores ──────────────────────────────────────────────────────────────

export async function createDraftInvoice(db: Database, context: TenantContext, raw: Raw): Promise<{ readonly ok: true; readonly invoiceId: string } | Invalid> {
  return runInTenant(db, context, "invoices.draft", async (tx) => {
    const taxpayerId = activeTaxpayerId(context, "invoices.draft");
    const parsed = await parseDraft(tx, taxpayerId, raw);
    if (!parsed.ok) return parsed;
    const series = await seriesFor(tx, context, taxpayerId, "STANDARD", (await todayInSpain(tx)).slice(0, 4));
    const id = randomUUID();
    await tx.invoice.createMany({
      data: [{ id, tenantId: context.tenant.id, taxpayerId, seriesId: series.id, kind: "STANDARD", createdByUserId: context.user.id, ...invoiceAmounts(parsed.value) }],
    });
    await writeLines(tx, context, taxpayerId, id, parsed.value);
    return { ok: true, invoiceId: id };
  });
}

type NotDraft = { readonly ok: false; readonly reason: "NOT_FOUND" | "NOT_DRAFT" };

/** Ejecuta `work` sobre un BORRADOR del contribuyente activo, bloqueado (FOR UPDATE) hasta el final de la transacción. */
function withLockedDraft<T>(
  db: Database,
  context: TenantContext,
  permission: "invoices.draft" | "invoices.issue",
  invoiceId: string,
  work: (tx: Tx, taxpayerId: string, kind: Kind) => Promise<T>,
): Promise<T | NotDraft> {
  return runInTenant(db, context, permission, async (tx): Promise<T | NotDraft> => {
    const taxpayerId = activeTaxpayerId(context, permission);
    const current = await lockInvoice(tx, taxpayerId, invoiceId);
    if (current === null) return { ok: false, reason: "NOT_FOUND" };
    if (current.status !== "DRAFT") return { ok: false, reason: "NOT_DRAFT" };
    return work(tx, taxpayerId, current.kind);
  });
}

export async function updateDraftInvoice(db: Database, context: TenantContext, invoiceId: string, raw: Raw): Promise<{ readonly ok: true } | Invalid | NotDraft> {
  return withLockedDraft(db, context, "invoices.draft", invoiceId, async (tx, taxpayerId): Promise<{ readonly ok: true } | Invalid> => {
    const parsed = await parseDraft(tx, taxpayerId, raw);
    if (!parsed.ok) return parsed;
    await tx.invoiceLine.deleteMany({ where: { invoiceId, taxpayerId } });
    await tx.invoice.updateMany({ where: { id: invoiceId, taxpayerId }, data: invoiceAmounts(parsed.value) });
    await writeLines(tx, context, taxpayerId, invoiceId, parsed.value);
    return { ok: true };
  });
}

export async function deleteDraftInvoice(db: Database, context: TenantContext, invoiceId: string): Promise<{ readonly ok: true } | NotDraft> {
  return withLockedDraft(db, context, "invoices.draft", invoiceId, async (tx, taxpayerId): Promise<{ readonly ok: true }> => {
    await tx.invoice.deleteMany({ where: { id: invoiceId, taxpayerId } });
    await recordAudit(tx, context, "invoice.draft_deleted", { type: "invoice", id: invoiceId });
    return { ok: true };
  });
}

// ─── Emisión ─────────────────────────────────────────────────────────────────

const PARTY_FIELDS = { nif: true, legalName: true, addressLine: true, postalCode: true, city: true, province: true, countryCode: true } as const;

/** La AEAT rechazaría el registro de alta: no se emite y se explica por qué (ADR-008). */
type NotRegistrable = { readonly ok: false; readonly reason: "NOT_REGISTRABLE"; readonly errors: Readonly<Record<string, string>> };

/**
 * Emite un borrador: le asigna el siguiente número de la serie del año (bloqueando la serie, así que dos
 * emisiones simultáneas nunca comparten número y una transacción fallida no deja huecos), fija la fecha de
 * expedición (hoy en España), guarda emisor y destinatario tal como son ahora y genera su registro de alta
 * VERI*FACTU encadenado, todo en la misma transacción. Después es inalterable.
 */
export async function issueInvoice(
  db: Database,
  context: TenantContext,
  invoiceId: string,
  settings: VerifactuSettings,
): Promise<{ readonly ok: true; readonly number: string } | NotDraft | NotRegistrable> {
  return withLockedDraft(db, context, "invoices.issue", invoiceId, async (tx, taxpayerId, kind): Promise<{ readonly ok: true; readonly number: string } | NotRegistrable> => {
    const today = await todayInSpain(tx);
    const series = await seriesFor(tx, context, taxpayerId, kind, today.slice(0, 4));
    const [locked] = await tx.$queryRaw<{ next_number: number }[]>`SELECT next_number FROM invoice_series WHERE id = ${series.id}::uuid FOR UPDATE`;
    const number = locked?.next_number ?? 1;
    const formatted = formatInvoiceNumber(series.code, number);
    const alta = await altaDataFor(tx, taxpayerId, invoiceId, formatted, today);
    if (!alta.ok) return { ok: false, reason: "NOT_REGISTRABLE", errors: alta.errors };
    const invoice = await tx.invoice.findFirstOrThrow({ where: { id: invoiceId, taxpayerId }, select: { customer: { select: PARTY_FIELDS } } });
    // Emisor con su contacto y sus datos de cobro de HOY: la factura no cambia si después cambian.
    const issuer = await issuerProfile(tx, taxpayerId);

    await tx.invoice.updateMany({
      where: { id: invoiceId, taxpayerId },
      data: {
        status: "ISSUED",
        seriesId: series.id,
        number,
        issueDate: new Date(`${today}T00:00:00Z`),
        issuedAt: new Date(),
        issuedByUserId: context.user.id,
        issuerSnapshot: { ...issuer.profile },
        customerSnapshot: invoice.customer,
        dueDate: issuer.paymentTermsDays === null ? null : new Date(`${addDays(today, issuer.paymentTermsDays)}T00:00:00Z`),
      },
    });
    await tx.invoiceSeries.updateMany({ where: { id: series.id }, data: { nextNumber: number + 1 } });
    await registerAlta(tx, context, taxpayerId, invoiceId, alta.data, settings);
    await recordAudit(tx, context, "invoice.issued", { type: "invoice", id: invoiceId }, { number: formatted });
    return { ok: true, number: formatted };
  });
}

// ─── Rectificativas ──────────────────────────────────────────────────────────

const REASON_MAX = 500;

/**
 * Crea un BORRADOR de rectificativa por diferencias: mismas líneas con la cantidad cambiada de signo
 * (anulación total), que se puede ajustar antes de emitirla en la serie de rectificativas del año.
 */
/** Motivo (1–500 caracteres) y clave de rectificación (lista L2: R1–R4), o sus errores. */
function parseRectification(raw: { readonly reason?: unknown; readonly code?: unknown }): { ok: true; reason: string; code: string } | Invalid {
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  const code = RECTIFICATION_TYPES.find((candidate) => candidate === raw.code);
  const errors: Record<string, string> = {};
  if (reason === "" || reason.length > REASON_MAX) errors["reason"] = "Explica el motivo de la rectificación.";
  if (code === undefined) errors["code"] = "Elige el tipo de rectificación.";
  return code === undefined || "reason" in errors ? { ok: false, reason: "INVALID", errors } : { ok: true, reason, code };
}

export async function rectifyInvoice(
  db: Database,
  context: TenantContext,
  invoiceId: string,
  raw: { readonly reason?: unknown; readonly code?: unknown },
): Promise<{ readonly ok: true; readonly invoiceId: string } | Invalid | { readonly ok: false; readonly reason: "NOT_FOUND" | "NOT_ISSUED" | "ANNULLED" }> {
  return runInTenant(db, context, "invoices.rectify", async (tx) => {
    const taxpayerId = activeTaxpayerId(context, "invoices.rectify");
    const original = UUID.test(invoiceId)
      ? await tx.invoice.findFirst({
          where: { id: invoiceId, taxpayerId },
          select: { status: true, customerId: true, equivalenceSurcharge: true, withholdingPercent: true, lines: { orderBy: { position: "asc" } } },
        })
      : null;
    if (original === null) return { ok: false, reason: "NOT_FOUND" };
    if (original.status !== "ISSUED") return { ok: false, reason: "NOT_ISSUED" };
    if ((await invoiceRecords(tx, taxpayerId, invoiceId)).anulacion !== null) return { ok: false, reason: "ANNULLED" };
    const parsed = parseRectification(raw);
    if (!parsed.ok) return parsed;

    const input: DraftInput = {
      customer: { id: original.customerId, equivalenceSurcharge: original.equivalenceSurcharge },
      withholdingPercent: BigInt(original.withholdingPercent),
      notes: null,
      lines: original.lines.map((line) => ({
        description: line.description,
        quantity: -line.quantity,
        unitPrice: line.unitPrice,
        discountPercent: BigInt(line.discountPercent),
        tax: parseTaxCategory(line.taxKey) ?? { kind: "EXEMPT", cause: null },
      })),
    };
    const series = await seriesFor(tx, context, taxpayerId, "RECTIFYING", (await todayInSpain(tx)).slice(0, 4));
    const id = randomUUID();
    await tx.invoice.createMany({
      data: [
        {
          id,
          tenantId: context.tenant.id,
          taxpayerId,
          seriesId: series.id,
          kind: "RECTIFYING",
          rectifiesInvoiceId: invoiceId,
          rectificationReason: parsed.reason,
          rectificationCode: parsed.code,
          createdByUserId: context.user.id,
          ...invoiceAmounts(input),
        },
      ],
    });
    await writeLines(tx, context, taxpayerId, id, input);
    await recordAudit(tx, context, "invoice.rectification_created", { type: "invoice", id }, { rectifies: invoiceId });
    return { ok: true, invoiceId: id };
  });
}

// ─── Consulta ────────────────────────────────────────────────────────────────

const dateText = (date: Date | null): string | null => (date === null ? null : isoDate(date));

export interface InvoiceSummary {
  readonly id: string;
  readonly kind: Kind;
  readonly status: "DRAFT" | "ISSUED";
  readonly number: string | null;
  readonly issueDate: string | null;
  readonly customerName: string;
  readonly total: bigint;
  /** Tiene registro de anulación VERI*FACTU (se expidió por error). */
  readonly annulled: boolean;
}

/** Cuenta solo los registros de anulación: con uno, la factura está anulada. */
const ANNULMENTS = { _count: { select: { billingRecords: { where: { kind: "ANULACION" as const } } } } };

type SummaryRow = {
  readonly id: string;
  readonly kind: Kind;
  readonly status: "DRAFT" | "ISSUED";
  readonly number: number | null;
  readonly issueDate: Date | null;
  readonly total: bigint;
  readonly series: { readonly code: string };
  readonly customer: { readonly legalName: string };
  readonly _count: { readonly billingRecords: number };
};

const summaryOf = (row: SummaryRow): InvoiceSummary => ({
  id: row.id,
  kind: row.kind,
  status: row.status,
  number: row.number === null ? null : formatInvoiceNumber(row.series.code, row.number),
  issueDate: dateText(row.issueDate),
  customerName: row.customer.legalName,
  total: row.total,
  annulled: row._count.billingRecords > 0,
});

export function listInvoices(db: Database, context: TenantContext): Promise<InvoiceSummary[]> {
  return runInTenant(db, context, "invoices.read", async (tx) => {
    const rows = await tx.invoice.findMany({
      where: { taxpayerId: activeTaxpayerId(context, "invoices.read") },
      select: { id: true, kind: true, status: true, number: true, issueDate: true, total: true, series: { select: { code: true } }, customer: { select: { legalName: true } }, ...ANNULMENTS },
      orderBy: [{ createdAt: "desc" }],
    });
    return rows.map(summaryOf);
  });
}

export interface InvoiceLineView {
  readonly position: number;
  readonly description: string;
  readonly quantity: bigint;
  readonly unitPrice: bigint;
  readonly discountPercent: bigint;
  readonly taxKey: string;
  readonly lineBase: bigint;
}

export interface InvoiceDetail extends InvoiceSummary {
  readonly customerId: string;
  /** Email actual del cliente (para enviarle el borrador o la factura); null si no tiene. */
  readonly customerEmail: string | null;
  /** Vencimiento: el fijado al emitir; en un borrador, hoy + el plazo configurado (null sin plazo). */
  readonly dueDate: string | null;
  readonly equivalenceSurcharge: boolean;
  readonly withholdingPercent: bigint;
  readonly taxableBase: bigint;
  readonly vatTotal: bigint;
  readonly surchargeTotal: bigint;
  readonly withholdingAmount: bigint;
  readonly breakdown: readonly TaxBreakdown[];
  /** Emisor y destinatario: los guardados al emitir; en un borrador, los de ahora (aún pueden cambiar). */
  readonly issuerSnapshot: unknown;
  readonly customerSnapshot: unknown;
  readonly rectifiesInvoiceId: string | null;
  readonly rectifiesNumber: string | null;
  readonly rectificationReason: string | null;
  readonly rectificationCode: string | null;
  readonly notes: string | null;
  readonly lines: readonly InvoiceLineView[];
  /** Registros VERI*FACTU de la factura (alta al emitir; anulación si se anuló). */
  readonly verifactu: InvoiceRecords;
}

async function numberOf(tx: Tx, taxpayerId: string, invoiceId: string | null): Promise<string | null> {
  if (invoiceId === null) return null;
  const row = await tx.invoice.findFirst({ where: { id: invoiceId, taxpayerId }, select: { number: true, series: { select: { code: true } } } });
  return row?.number == null ? null : formatInvoiceNumber(row.series.code, row.number);
}

export function getInvoice(db: Database, context: TenantContext, invoiceId: string): Promise<InvoiceDetail | null> {
  return runInTenant(db, context, "invoices.read", async (tx) => {
    const taxpayerId = activeTaxpayerId(context, "invoices.read");
    if (!UUID.test(invoiceId)) return null;
    const row = await tx.invoice.findFirst({
      where: { id: invoiceId, taxpayerId },
      include: { series: { select: { code: true } }, customer: { select: { ...PARTY_FIELDS, email: true } }, lines: { orderBy: { position: "asc" } }, ...ANNULMENTS },
    });
    if (row === null) return null;
    const { email: customerEmail, ...customer } = row.customer;
    const draft = row.status === "DRAFT";
    const current = draft ? await issuerProfile(tx, taxpayerId) : null;
    const issuer = current === null ? row.issuerSnapshot : current.profile;
    const dueDate = current === null ? dateText(row.dueDate) : current.paymentTermsDays === null ? null : addDays(await todayInSpain(tx), current.paymentTermsDays);
    const lines = row.lines.map((line) => ({ ...line, discountPercent: BigInt(line.discountPercent) }));
    const breakdown = totalsOfStored(row.lines, row.equivalenceSurcharge, row.withholdingPercent).breakdown;
    return {
      ...summaryOf(row),
      customerId: row.customerId,
      customerEmail,
      dueDate,
      equivalenceSurcharge: row.equivalenceSurcharge,
      withholdingPercent: BigInt(row.withholdingPercent),
      taxableBase: row.taxableBase,
      vatTotal: row.vatTotal,
      surchargeTotal: row.surchargeTotal,
      withholdingAmount: row.withholdingAmount,
      breakdown,
      issuerSnapshot: issuer,
      customerSnapshot: draft ? customer : row.customerSnapshot,
      rectifiesInvoiceId: row.rectifiesInvoiceId,
      rectifiesNumber: await numberOf(tx, taxpayerId, row.rectifiesInvoiceId),
      rectificationReason: row.rectificationReason,
      rectificationCode: row.rectificationCode,
      notes: row.notes,
      lines: lines.map(({ position, description, quantity, unitPrice, discountPercent, taxKey, lineBase }) => ({
        position,
        description,
        quantity,
        unitPrice,
        discountPercent,
        taxKey,
        lineBase,
      })),
      verifactu: await invoiceRecords(tx, taxpayerId, invoiceId),
    };
  });
}

// ─── Envío al cliente ────────────────────────────────────────────────────────

/**
 * Deja constancia (auditoría) de que se envió por email el borrador o la factura a `to`. El envío en sí lo
 * hace quien llama; enviar es cosa de quien prepara facturas (invoices.draft), no de quien solo las lee.
 */
export function recordInvoiceSent(
  db: Database,
  context: TenantContext,
  invoiceId: string,
  to: string,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: "NOT_FOUND" }> {
  return runInTenant(db, context, "invoices.draft", async (tx) => {
    const taxpayerId = activeTaxpayerId(context, "invoices.draft");
    const row = UUID.test(invoiceId) ? await tx.invoice.findFirst({ where: { id: invoiceId, taxpayerId }, select: { status: true } }) : null;
    if (row === null) return { ok: false, reason: "NOT_FOUND" };
    await recordAudit(tx, context, "invoice.sent", { type: "invoice", id: invoiceId }, { to, status: row.status });
    return { ok: true };
  });
}
