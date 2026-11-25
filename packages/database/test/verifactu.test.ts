// VERI*FACTU a nivel de PostgreSQL (migración 20261124000500): la BD comprueba la cadena de cada facturación al
// insertar, solo registra facturas emitidas, no deja modificar ni borrar registros (ni al propietario) y aísla
// por contribuyente con RLS. Roles reales; datos ficticios.
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { describe, expect, it } from "vitest";
import { FIXTURE } from "../src/testing";
import { CONTEXTS, draftFor, inContext, issue, roleClients, type Ctx } from "./support";

const { tenants, taxpayers } = FIXTURE;
const db = roleClients();
const { ana, carl, bea } = CONTEXTS;

const HASH = (char: string): string => char.repeat(64);
let nextNumber = 1000;

/** La facturación del contribuyente (una por contribuyente), creándola la primera vez, como propietario. */
async function billingSystem(tenantId: string, taxpayerId: string): Promise<string> {
  const existing = await db.owner().query<{ id: string }>("SELECT id FROM billing_systems WHERE taxpayer_id = $1", [taxpayerId]);
  if (existing.rows[0] !== undefined) return existing.rows[0].id;
  const created = await db.owner().query<{ id: string }>("INSERT INTO billing_systems (tenant_id, taxpayer_id) VALUES ($1, $2) RETURNING id", [tenantId, taxpayerId]);
  return created.rows[0]?.id ?? "";
}

/** Factura emitida del contribuyente, lista para registrar. */
async function issuedInvoice(tenantId: string, taxpayerId: string): Promise<string> {
  const { invoice } = await draftFor(db.owner(), tenantId, taxpayerId);
  nextNumber += 1;
  await issue(db.owner(), invoice, nextNumber);
  return invoice;
}

interface RecordRow {
  readonly tenantId: string;
  readonly taxpayerId: string;
  readonly systemId: string;
  readonly invoiceId: string;
  readonly sequence: number;
  readonly previousHash: string | null;
  readonly hash: string;
}

const INSERT_RECORD = `INSERT INTO billing_records
  (tenant_id, taxpayer_id, billing_system_id, sequence, kind, invoice_id, issuer_nif, invoice_number, issue_date,
   invoice_type, cuota_total, importe_total, previous_hash, hash, generated_at, xml)
  VALUES ($1, $2, $3, $4, 'ALTA', $5, '12345678Z', 'F-1', current_date, 'F1', '21.00', '121.00', $6, $7, '2026-11-24T10:00:00+01:00', '<x/>')
  RETURNING id`;

const insertRecord = (client: pg.Client, row: RecordRow) =>
  client.query<{ id: string }>(INSERT_RECORD, [row.tenantId, row.taxpayerId, row.systemId, row.sequence, row.invoiceId, row.previousHash, row.hash]);

/** Cadena de `length` registros válidos en una facturación nueva de a1; devuelve sus ids. */
async function chainOf(length: number): Promise<{ systemId: string; ids: string[] }> {
  const systemId = await billingSystem(tenants.a.id, taxpayers.a1);
  const last = await db.owner().query<{ sequence: number; hash: string }>(
    "SELECT sequence, hash FROM billing_records WHERE billing_system_id = $1 ORDER BY sequence DESC LIMIT 1",
    [systemId],
  );
  let sequence = last.rows[0]?.sequence ?? 0;
  let previousHash: string | null = last.rows[0]?.hash ?? null;
  const ids: string[] = [];
  for (let index = 0; index < length; index += 1) {
    sequence += 1;
    const hash = randomUUID().replace(/-/g, "").toUpperCase().padEnd(64, "A");
    const invoiceId = await issuedInvoice(tenants.a.id, taxpayers.a1);
    const inserted = await insertRecord(db.owner(), { tenantId: tenants.a.id, taxpayerId: taxpayers.a1, systemId, invoiceId, sequence, previousHash, hash });
    ids.push(inserted.rows[0]?.id ?? "");
    previousHash = hash;
  }
  return { systemId, ids };
}

describe("la cadena la comprueba la base de datos al insertar", () => {
  it("cada registro debe enlazar la huella del inmediatamente anterior de su facturación", async () => {
    const { systemId } = await chainOf(2);
    const last = await db.owner().query<{ sequence: number; hash: string }>("SELECT sequence, hash FROM billing_records WHERE billing_system_id = $1 ORDER BY sequence DESC LIMIT 1", [systemId]);
    const tip = last.rows[0];
    const invoiceId = await issuedInvoice(tenants.a.id, taxpayers.a1);
    const base = { tenantId: tenants.a.id, taxpayerId: taxpayers.a1, systemId, invoiceId, hash: HASH("C") };
    // Huella anterior equivocada.
    await expect(insertRecord(db.owner(), { ...base, sequence: (tip?.sequence ?? 0) + 1, previousHash: HASH("D") })).rejects.toThrow(/BILLING_CHAIN_BROKEN/);
    // Salto en la secuencia.
    await expect(insertRecord(db.owner(), { ...base, sequence: (tip?.sequence ?? 0) + 2, previousHash: tip?.hash ?? null })).rejects.toThrow(/BILLING_CHAIN_BROKEN/);
    // Correcto.
    await expect(insertRecord(db.owner(), { ...base, sequence: (tip?.sequence ?? 0) + 1, previousHash: tip?.hash ?? null })).resolves.toMatchObject({ rowCount: 1 });
  });

  it("el primer registro no lleva huella anterior y los siguientes sí (art. 7.b)", async () => {
    const systemId = await billingSystem(tenants.b.id, taxpayers.b1);
    const invoiceId = await issuedInvoice(tenants.b.id, taxpayers.b1);
    const base = { tenantId: tenants.b.id, taxpayerId: taxpayers.b1, systemId, invoiceId, hash: HASH("E") };
    await expect(insertRecord(db.owner(), { ...base, sequence: 1, previousHash: HASH("F") })).rejects.toThrow(/billing_records_first_has_no_previous/);
    // Sin huella anterior más allá del primero: lo frena el trigger de la cadena (se ejecuta antes que el CHECK).
    await expect(insertRecord(db.owner(), { ...base, sequence: 2, previousHash: null })).rejects.toThrow(/BILLING_CHAIN_BROKEN/);
  });

  it("solo se registran facturas emitidas, de su mismo contribuyente", async () => {
    const systemId = await billingSystem(tenants.a.id, taxpayers.a1);
    const { invoice: draft } = await draftFor(db.owner(), tenants.a.id, taxpayers.a1);
    const row = { tenantId: tenants.a.id, taxpayerId: taxpayers.a1, systemId, invoiceId: draft, sequence: 1, previousHash: null, hash: HASH("A") };
    await expect(insertRecord(db.owner(), row)).rejects.toThrow(/BILLING_RECORD_INVALID/);
    const foreign = await issuedInvoice(tenants.a.id, taxpayers.a2);
    await expect(insertRecord(db.owner(), { ...row, invoiceId: foreign })).rejects.toThrow(/foreign key|BILLING_RECORD_INVALID/);
  });

  it("formato de las huellas y campos según el tipo de registro", async () => {
    const { systemId } = await chainOf(1);
    const tip = (await db.owner().query<{ sequence: number; hash: string }>("SELECT sequence, hash FROM billing_records WHERE billing_system_id = $1 ORDER BY sequence DESC LIMIT 1", [systemId])).rows[0];
    const invoiceId = await issuedInvoice(tenants.a.id, taxpayers.a1);
    const next = { tenantId: tenants.a.id, taxpayerId: taxpayers.a1, systemId, invoiceId, sequence: (tip?.sequence ?? 0) + 1, previousHash: tip?.hash ?? null };
    await expect(insertRecord(db.owner(), { ...next, hash: "abc" })).rejects.toThrow(/billing_records_hash_format/);
    await expect(insertRecord(db.owner(), { ...next, hash: HASH("a") })).rejects.toThrow(/billing_records_hash_format/);
    await expect(
      db.owner().query(
        `INSERT INTO billing_records (tenant_id, taxpayer_id, billing_system_id, sequence, kind, invoice_id, issuer_nif, invoice_number, issue_date, invoice_type, importe_total, previous_hash, hash, generated_at, xml)
         VALUES ($1, $2, $3, 1, 'ANULACION', $4, '12345678Z', 'F-1', current_date, 'F1', NULL, NULL, $5, 'x', '<x/>')`,
        [tenants.a.id, taxpayers.a1, systemId, invoiceId, HASH("B")],
      ),
    ).rejects.toThrow(/billing_records_kind_fields/);
  });
});

describe("los registros son inalterables para todos los roles", () => {
  it("ni el propietario los modifica ni los borra; solo cambia el estado de la remisión", async () => {
    const { ids } = await chainOf(1);
    const id = ids[0] ?? "";
    await expect(db.owner().query("UPDATE billing_records SET hash = $2 WHERE id = $1", [id, HASH("9")])).rejects.toThrow(/BILLING_RECORD_IMMUTABLE/);
    await expect(db.owner().query("UPDATE billing_records SET xml = '<y/>' WHERE id = $1", [id])).rejects.toThrow(/BILLING_RECORD_IMMUTABLE/);
    await expect(db.owner().query("DELETE FROM billing_records WHERE id = $1", [id])).rejects.toThrow(/BILLING_RECORD_IMMUTABLE/);
    await expect(db.owner().query("UPDATE billing_records SET status = 'ACCEPTED' WHERE id = $1", [id])).resolves.toMatchObject({ rowCount: 1 });
  });

  it("la aplicación no tiene permiso para modificar ni borrar registros", async () => {
    const { ids } = await chainOf(1);
    await inContext(db.app(), ana, async () => {
      await expect(db.app().query("UPDATE billing_records SET status = 'ACCEPTED' WHERE id = $1", [ids[0]])).rejects.toThrow(/permission denied/);
    });
    await inContext(db.app(), ana, async () => {
      await expect(db.app().query("DELETE FROM billing_records WHERE id = $1", [ids[0]])).rejects.toThrow(/permission denied/);
    });
  });
});

describe("RLS por contribuyente", () => {
  it("solo lectura: ve los registros pero no puede crear facturaciones ni registros", async () => {
    const { ids } = await chainOf(1);
    await inContext(db.app(), carl, async () => {
      expect((await db.app().query("SELECT 1 FROM billing_records WHERE id = $1", [ids[0]])).rowCount).toBe(1);
      await expect(db.app().query("INSERT INTO billing_systems (tenant_id, taxpayer_id) VALUES ($1, $2)", [tenants.a.id, taxpayers.a1])).rejects.toThrow(/row-level security|duplicate key/);
    });
  });

  it("sin acceso al contribuyente u otra organización: no ve nada", async () => {
    await chainOf(1);
    await inContext(db.app(), carl, async () => {
      expect((await db.app().query("SELECT 1 FROM billing_records WHERE taxpayer_id = $1", [taxpayers.a2])).rowCount).toBe(0);
    });
    await inContext(db.app(), bea, async () => {
      expect((await db.app().query("SELECT 1 FROM billing_records WHERE taxpayer_id = $1", [taxpayers.a1])).rowCount).toBe(0);
      expect((await db.app().query("SELECT 1 FROM billing_systems WHERE taxpayer_id = $1", [taxpayers.a1])).rowCount).toBe(0);
    });
  });
});

describe("otras restricciones de la Fase 5", () => {
  it("causas de exención admitidas: E1, E4 y E6 (y la antigua sin causa)", async () => {
    const { invoice } = await draftFor(db.owner(), tenants.a.id, taxpayers.a1);
    for (const key of ["EXEMPT:E1", "EXEMPT:E4", "EXEMPT:E6", "EXEMPT"]) {
      await expect(db.owner().query("UPDATE invoice_lines SET tax_key = $2 WHERE invoice_id = $1", [invoice, key])).resolves.toMatchObject({ rowCount: 1 });
    }
    for (const key of ["EXEMPT:E2", "EXEMPT:E5"]) {
      await expect(db.owner().query("UPDATE invoice_lines SET tax_key = $2 WHERE invoice_id = $1", [invoice, key])).rejects.toThrow(/invoice_lines_tax_key/);
    }
  });

  it("una rectificativa nueva lleva su clave R1–R4; una ordinaria no", async () => {
    const original = await issuedInvoice(tenants.a.id, taxpayers.a1);
    const { invoice } = await draftFor(db.owner(), tenants.a.id, taxpayers.a1);
    const rectify = (code: string | null) =>
      db.owner().query("UPDATE invoices SET kind = 'RECTIFYING', rectifies_invoice_id = $2, rectification_reason = 'x', rectification_code = $3 WHERE id = $1", [invoice, original, code]);
    await expect(rectify(null)).rejects.toThrow(/invoices_rectification_code_consistent|invoices_series_kind_fkey/);
    await expect(rectify("R5")).rejects.toThrow(/invoices_rectification_code_value/);
    await expect(db.owner().query("UPDATE invoices SET rectification_code = 'R1' WHERE id = $1", [invoice])).rejects.toThrow(/invoices_rectification_code_consistent/);
  });

  it("IndicadorMultiplesOT: la organización a lleva dos contribuyentes y la b uno", async () => {
    const multiple = async (ctx: Ctx) => inContext(db.app(), ctx, async () => (await db.app().query<{ m: boolean }>("SELECT app.tenant_has_multiple_taxpayers() AS m")).rows[0]?.m);
    expect(await multiple(ana)).toBe(true);
    // Carl solo ve a1, pero el indicador es de la organización.
    expect(await multiple(carl)).toBe(true);
    expect(await multiple(bea)).toBe(false);
  });
});
