// Plantillas de factura: lo que se repite (cliente opcional, líneas, retención, observaciones) con un nombre
// identificativo. Usar una plantilla rellena el editor de una factura nueva; la plantilla no cambia.
// Mismas reglas de entrada que los borradores (invoice-shared). Leer: invoices.read. Crear/editar/borrar: invoices.draft.
import { randomUUID } from "node:crypto";
import type { Database, Tx } from "@facturalibre/database";
import { taxCategoryKey, type ParsedLine } from "@facturalibre/fiscal-core";
import { activeTaxpayerId } from "./catalog";
import { databaseErrorCode } from "./database-errors";
import { parseLines, parseNotes, parseWithholding, totalsOfStored, UUID, type Invalid } from "./invoice-shared";
import { runInTenant } from "./run-in-tenant";
import type { TenantContext } from "./tenant-context";

type Raw = Readonly<Record<string, unknown>>;
type NotFound = { readonly ok: false; readonly reason: "NOT_FOUND" };

const NAME_MAX = 80;
const NAME_TAKEN: Invalid = { ok: false, reason: "INVALID", errors: { name: "Ya tienes una plantilla con ese nombre." } };

export interface TemplateLine {
  readonly description: string;
  /** Escalas de fiscal-core (SCALE): cantidad ×1000, precio ×10 000, descuento ×100. */
  readonly quantity: bigint;
  readonly unitPrice: bigint;
  readonly discountPercent: bigint;
  readonly taxKey: string;
}

export interface InvoiceTemplateSummary {
  readonly id: string;
  readonly name: string;
  readonly customerName: string | null;
  readonly lineCount: number;
  /** Total en céntimos con las líneas tal como están (con el recargo del cliente, si lo tiene). */
  readonly total: bigint;
}

export interface InvoiceTemplateDetail {
  readonly id: string;
  readonly name: string;
  readonly customerId: string | null;
  readonly withholdingPercent: bigint;
  readonly notes: string | null;
  readonly lines: readonly TemplateLine[];
}

interface TemplateInput {
  readonly name: string;
  readonly customerId: string | null;
  readonly lines: readonly ParsedLine[];
  readonly withholdingPercent: bigint;
  readonly notes: string | null;
}

function parseName(raw: unknown, errors: Record<string, string>): string {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (name === "") errors["name"] = "Ponle un nombre para encontrarla después.";
  else if (name.length > NAME_MAX) errors["name"] = `El nombre no puede superar los ${String(NAME_MAX)} caracteres.`;
  return name;
}

/** Cliente opcional: vacío → sin cliente; si se indica, debe ser del contribuyente. */
async function parseCustomer(tx: Tx, taxpayerId: string, raw: unknown, errors: Record<string, string>): Promise<string | null> {
  if (raw === undefined || raw === null || raw === "") return null;
  const found = typeof raw === "string" && UUID.test(raw) ? await tx.customer.findFirst({ where: { id: raw, taxpayerId }, select: { id: true } }) : null;
  if (found === null) errors["customerId"] = "Ese cliente ya no existe.";
  return found?.id ?? null;
}

async function parseTemplate(tx: Tx, taxpayerId: string, raw: Raw): Promise<{ readonly ok: true; readonly value: TemplateInput } | Invalid> {
  const errors: Record<string, string> = {};
  const name = parseName(raw["name"], errors);
  const customerId = await parseCustomer(tx, taxpayerId, raw["customerId"], errors);
  const lines = parseLines(raw["lines"], errors);
  const withholdingPercent = parseWithholding(raw["withholdingPercent"], errors);
  const notes = parseNotes(raw["notes"], errors);
  if (Object.keys(errors).length > 0) return { ok: false, reason: "INVALID", errors };
  return { ok: true, value: { name, customerId, lines, withholdingPercent, notes } };
}

const templateFields = (input: TemplateInput) => ({
  name: input.name,
  customerId: input.customerId,
  withholdingPercent: Number(input.withholdingPercent),
  notes: input.notes,
});

async function writeLines(tx: Tx, context: TenantContext, taxpayerId: string, templateId: string, lines: readonly ParsedLine[]): Promise<void> {
  await tx.invoiceTemplateLine.createMany({
    data: lines.map((line, index) => ({
      tenantId: context.tenant.id,
      taxpayerId,
      templateId,
      position: index + 1,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: Number(line.discountPercent),
      taxKey: taxCategoryKey(line.tax),
    })),
  });
}

/** Crea (templateId null) o sustituye una plantilla del contribuyente activo. */
export async function saveInvoiceTemplate(
  db: Database,
  context: TenantContext,
  templateId: string | null,
  raw: Raw,
): Promise<{ readonly ok: true; readonly templateId: string } | Invalid | NotFound> {
  try {
    return await runInTenant(db, context, "invoices.draft", async (tx) => {
      const taxpayerId = activeTaxpayerId(context, "invoices.draft");
      const parsed = await parseTemplate(tx, taxpayerId, raw);
      if (!parsed.ok) return parsed;
      if (templateId === null) {
        const id = randomUUID();
        await tx.invoiceTemplate.createMany({
          data: [{ id, tenantId: context.tenant.id, taxpayerId, createdByUserId: context.user.id, ...templateFields(parsed.value) }],
        });
        await writeLines(tx, context, taxpayerId, id, parsed.value.lines);
        return { ok: true, templateId: id };
      }
      const updated = UUID.test(templateId)
        ? await tx.invoiceTemplate.updateMany({ where: { id: templateId, taxpayerId }, data: templateFields(parsed.value) })
        : { count: 0 };
      if (updated.count === 0) return { ok: false, reason: "NOT_FOUND" };
      await tx.invoiceTemplateLine.deleteMany({ where: { templateId, taxpayerId } });
      await writeLines(tx, context, taxpayerId, templateId, parsed.value.lines);
      return { ok: true, templateId };
    });
  } catch (error) {
    // Índice único (taxpayer_id, lower(name)): dos plantillas no se llaman igual.
    if (databaseErrorCode(error) === "23505") return NAME_TAKEN;
    throw error;
  }
}

/** Plantillas del contribuyente activo por nombre, con su cliente, cuántas líneas tiene y su total. */
export function listInvoiceTemplates(db: Database, context: TenantContext): Promise<InvoiceTemplateSummary[]> {
  return runInTenant(db, context, "invoices.read", async (tx) => {
    const taxpayerId = activeTaxpayerId(context, "invoices.read");
    const templates = await tx.invoiceTemplate.findMany({
      where: { taxpayerId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, customerId: true, withholdingPercent: true, lines: { select: { quantity: true, unitPrice: true, discountPercent: true, taxKey: true } } },
    });
    const customerIds = templates.flatMap((template) => (template.customerId === null ? [] : [template.customerId]));
    const customers = await tx.customer.findMany({ where: { taxpayerId, id: { in: customerIds } }, select: { id: true, legalName: true, equivalenceSurcharge: true } });
    const byId = new Map(customers.map((customer) => [customer.id, customer]));
    return templates.map((template) => {
      const customer = template.customerId === null ? undefined : byId.get(template.customerId);
      return {
        id: template.id,
        name: template.name,
        customerName: customer?.legalName ?? null,
        lineCount: template.lines.length,
        total: totalsOfStored(template.lines, customer?.equivalenceSurcharge ?? false, template.withholdingPercent).total,
      };
    });
  });
}

export function getInvoiceTemplate(db: Database, context: TenantContext, templateId: string): Promise<InvoiceTemplateDetail | null> {
  return runInTenant(db, context, "invoices.read", async (tx) => {
    if (!UUID.test(templateId)) return null;
    const template = await tx.invoiceTemplate.findFirst({
      where: { id: templateId, taxpayerId: activeTaxpayerId(context, "invoices.read") },
      select: {
        id: true,
        name: true,
        customerId: true,
        withholdingPercent: true,
        notes: true,
        lines: { orderBy: { position: "asc" }, select: { description: true, quantity: true, unitPrice: true, discountPercent: true, taxKey: true } },
      },
    });
    if (template === null) return null;
    return {
      ...template,
      withholdingPercent: BigInt(template.withholdingPercent),
      lines: template.lines.map((line) => ({ ...line, discountPercent: BigInt(line.discountPercent) })),
    };
  });
}

export function deleteInvoiceTemplate(db: Database, context: TenantContext, templateId: string): Promise<{ readonly ok: true } | NotFound> {
  return runInTenant(db, context, "invoices.draft", async (tx) => {
    const deleted = UUID.test(templateId)
      ? await tx.invoiceTemplate.deleteMany({ where: { id: templateId, taxpayerId: activeTaxpayerId(context, "invoices.draft") } })
      : { count: 0 };
    return deleted.count === 0 ? { ok: false, reason: "NOT_FOUND" } : { ok: true };
  });
}
