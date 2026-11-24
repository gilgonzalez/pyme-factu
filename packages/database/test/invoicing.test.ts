// Facturación a nivel de PostgreSQL: RLS por contribuyente, integridad entre contribuyentes y
// inmutabilidad de las facturas emitidas. Roles reales; datos ficticios.
import type pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { FIXTURE, testClients } from "../src/testing";
import { draftFor as draftAs, inContext as inContextOf, issue as issueAs, type Ctx } from "./support";

const { users, tenants, taxpayers } = FIXTURE;
const urls = inject("dbUrls");
const clients = testClients();
let app: pg.Client;
let owner: pg.Client;

const ana: Ctx = { user: users.ana, tenant: tenants.a.id };
const carl: Ctx = { user: users.carl, tenant: tenants.a.id }; // EMPLOYEE, solo lectura en a1, sin acceso a a2
const inContext = <T>(ctx: Ctx, work: () => Promise<T>): Promise<T> => inContextOf(app, ctx, work);
const draftFor = (tenantId: string, taxpayerId: string) => draftAs(owner, tenantId, taxpayerId);
const issue = (invoiceId: string, number: number): Promise<void> => issueAs(owner, invoiceId, number);

beforeAll(async () => {
  app = await clients.connect(urls.app);
  owner = await clients.connect(urls.owner);
});
afterAll(async () => {
  await clients.closeAll();
});

describe("RLS por contribuyente", () => {
  it("con acceso de solo lectura se ven los datos pero no se pueden crear ni modificar", async () => {
    const { invoice, customer } = await draftFor(tenants.a.id, taxpayers.a1);
    await inContext(carl, async () => {
      const seen = await app.query("SELECT id FROM invoices WHERE id = $1", [invoice]);
      expect(seen.rowCount).toBe(1);
      await expect(
        app.query(`INSERT INTO customers (tenant_id, taxpayer_id, legal_name, updated_at) VALUES ($1, $2, 'X', now())`, [tenants.a.id, taxpayers.a1]),
      ).rejects.toThrow(/row-level security/);
    });
    await inContext(carl, async () => {
      const updated = await app.query("UPDATE customers SET legal_name = 'Cambiado' WHERE id = $1", [customer]);
      expect(updated.rowCount).toBe(0);
    });
  });

  it("sin acceso al contribuyente no se ve nada de su facturación", async () => {
    const { invoice } = await draftFor(tenants.a.id, taxpayers.a2);
    await inContext(carl, async () => {
      for (const table of ["invoices", "invoice_lines", "customers", "invoice_series"]) {
        const rows = await app.query(`SELECT 1 FROM ${table} WHERE taxpayer_id = $1`, [taxpayers.a2]);
        expect(rows.rowCount, table).toBe(0);
      }
      expect((await app.query("SELECT 1 FROM invoices WHERE id = $1", [invoice])).rowCount).toBe(0);
    });
  });

  it("otro tenant no ve ni toca la facturación ajena", async () => {
    const { invoice } = await draftFor(tenants.b.id, taxpayers.b1);
    await inContext(ana, async () => {
      expect((await app.query("SELECT 1 FROM invoices WHERE id = $1", [invoice])).rowCount).toBe(0);
      expect((await app.query("DELETE FROM invoices WHERE id = $1", [invoice])).rowCount).toBe(0);
    });
  });

  it("con acceso completo se crean y modifican borradores", async () => {
    const { invoice } = await draftFor(tenants.a.id, taxpayers.a1);
    await inContext(ana, async () => {
      const updated = await app.query("UPDATE invoices SET notes = 'Nota' WHERE id = $1", [invoice]);
      expect(updated.rowCount).toBe(1);
    });
  });
});

describe("integridad entre contribuyentes (claves foráneas compuestas)", () => {
  it("una factura no puede usar un cliente ni una serie de otro contribuyente", async () => {
    const own = await draftFor(tenants.a.id, taxpayers.a1);
    const other = await draftFor(tenants.a.id, taxpayers.a2);
    await expect(owner.query("UPDATE invoices SET customer_id = $2 WHERE id = $1", [own.invoice, other.customer])).rejects.toThrow(/foreign key/);
    await expect(owner.query("UPDATE invoices SET series_id = $2 WHERE id = $1", [own.invoice, other.series])).rejects.toThrow(/foreign key/);
  });

  it("una rectificativa solo puede rectificar una factura del mismo contribuyente", async () => {
    const other = await draftFor(tenants.a.id, taxpayers.a2);
    const own = await draftFor(tenants.a.id, taxpayers.a1);
    await expect(
      owner.query("UPDATE invoices SET kind = 'RECTIFYING', rectifies_invoice_id = $2, rectification_reason = 'x', rectification_code = 'R1' WHERE id = $1", [own.invoice, other.invoice]),
    ).rejects.toThrow(/foreign key/);
  });
});

describe("estados y numeración", () => {
  it("un borrador no tiene número y una emitida siempre lo tiene", async () => {
    const { invoice } = await draftFor(tenants.a.id, taxpayers.a1);
    await expect(owner.query("UPDATE invoices SET number = 1 WHERE id = $1", [invoice])).rejects.toThrow(/invoices_number_only_when_issued/);
    await expect(owner.query("UPDATE invoices SET status = 'ISSUED' WHERE id = $1", [invoice])).rejects.toThrow(/invoices_number_only_when_issued/);
  });

  it("no se repite un número dentro de la misma serie", async () => {
    const first = await draftFor(tenants.a.id, taxpayers.a1);
    await issue(first.invoice, 1);
    const secondId = randomUUID();
    await owner.query(
      `INSERT INTO invoices (id, tenant_id, taxpayer_id, series_id, customer_id, kind, status, updated_at) VALUES ($1, $2, $3, $4, $5, 'STANDARD', 'DRAFT', now())`,
      [secondId, tenants.a.id, taxpayers.a1, first.series, first.customer],
    );
    await expect(issue(secondId, 1)).rejects.toMatchObject({ code: "23505" });
  });

  it("una rectificativa exige factura rectificada y motivo; una ordinaria no los admite", async () => {
    const { invoice } = await draftFor(tenants.a.id, taxpayers.a1);
    await expect(owner.query("UPDATE invoices SET kind = 'RECTIFYING' WHERE id = $1", [invoice])).rejects.toThrow(/invoices_rectification_(code_)?consistent/);
  });
});

describe("inmutabilidad de las facturas emitidas", () => {
  it("una factura emitida no se modifica ni se borra, ni siquiera con el rol propietario", async () => {
    const { invoice } = await draftFor(tenants.a.id, taxpayers.a1);
    await issue(invoice, 1);
    await expect(owner.query("UPDATE invoices SET notes = 'cambio' WHERE id = $1", [invoice])).rejects.toThrow(/INVOICE_IMMUTABLE/);
    await expect(owner.query("DELETE FROM invoices WHERE id = $1", [invoice])).rejects.toThrow(/INVOICE_IMMUTABLE/);
  });

  it("las líneas de una factura emitida tampoco se tocan", async () => {
    const { invoice } = await draftFor(tenants.a.id, taxpayers.a1);
    await issue(invoice, 1);
    await expect(owner.query("UPDATE invoice_lines SET description = 'x' WHERE invoice_id = $1", [invoice])).rejects.toThrow(/INVOICE_IMMUTABLE/);
    await expect(owner.query("DELETE FROM invoice_lines WHERE invoice_id = $1", [invoice])).rejects.toThrow(/INVOICE_IMMUTABLE/);
    await expect(
      owner.query(
        `INSERT INTO invoice_lines (tenant_id, taxpayer_id, invoice_id, position, description, quantity, unit_price, discount_percent, tax_key, line_base)
         VALUES ($1, $2, $3, 2, 'Añadida', 1000, 0, 0, 'EXEMPT:E1', 0)`,
        [tenants.a.id, taxpayers.a1, invoice],
      ),
    ).rejects.toThrow(/INVOICE_IMMUTABLE/);
  });

  it("un borrador sí se puede borrar (con sus líneas)", async () => {
    const { invoice } = await draftFor(tenants.a.id, taxpayers.a1);
    await owner.query("DELETE FROM invoices WHERE id = $1", [invoice]);
    expect((await owner.query("SELECT 1 FROM invoice_lines WHERE invoice_id = $1", [invoice])).rowCount).toBe(0);
  });

  it("los tipos de IVA de las líneas solo pueden ser los admitidos", async () => {
    const { invoice } = await draftFor(tenants.a.id, taxpayers.a1);
    await expect(owner.query("UPDATE invoice_lines SET tax_key = 'VAT:1600' WHERE invoice_id = $1", [invoice])).rejects.toThrow(/invoice_lines_tax_key/);
  });
});
