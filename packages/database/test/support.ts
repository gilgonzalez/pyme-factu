// Ayudantes compartidos por las pruebas de facturación y VERI*FACTU a nivel de PostgreSQL. Datos ficticios.
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { FIXTURE } from "../src/testing";

export interface Ctx {
  readonly user: string;
  readonly tenant: string;
}

/** Ejecuta `work` en `app` con el contexto indicado y revierte SIEMPRE. */
export async function inContext<T>(app: pg.Client, ctx: Ctx, work: () => Promise<T>): Promise<T> {
  await app.query("BEGIN");
  try {
    await app.query("SELECT set_config('app.user_id', $1, true), set_config('app.tenant_id', $2, true)", [ctx.user, ctx.tenant]);
    return await work();
  } finally {
    await app.query("ROLLBACK");
  }
}

export interface DraftIds {
  readonly series: string;
  readonly customer: string;
  readonly invoice: string;
}

/** Crea (como propietario de tablas) una serie, un cliente y un borrador con una línea para `taxpayerId`. */
export async function draftFor(owner: pg.Client, tenantId: string, taxpayerId: string): Promise<DraftIds> {
  const ids = { series: randomUUID(), customer: randomUUID(), invoice: randomUUID() };
  await owner.query(`INSERT INTO invoice_series (id, tenant_id, taxpayer_id, code, kind) VALUES ($1, $2, $3, $4, 'STANDARD')`, [
    ids.series,
    tenantId,
    taxpayerId,
    `F${randomUUID().slice(0, 6).toUpperCase()}`,
  ]);
  await owner.query(`INSERT INTO customers (id, tenant_id, taxpayer_id, legal_name, updated_at) VALUES ($1, $2, $3, 'Cliente Ficticio', now())`, [
    ids.customer,
    tenantId,
    taxpayerId,
  ]);
  await owner.query(
    `INSERT INTO invoices (id, tenant_id, taxpayer_id, series_id, customer_id, kind, status, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'STANDARD', 'DRAFT', now())`,
    [ids.invoice, tenantId, taxpayerId, ids.series, ids.customer],
  );
  await owner.query(
    `INSERT INTO invoice_lines (tenant_id, taxpayer_id, invoice_id, position, description, quantity, unit_price, discount_percent, tax_key, line_base)
     VALUES ($1, $2, $3, 1, 'Servicio ficticio', 1000, 1000000, 0, 'VAT:2100', 10000)`,
    [tenantId, taxpayerId, ids.invoice],
  );
  return ids;
}

export async function issue(owner: pg.Client, invoiceId: string, number: number): Promise<void> {
  await owner.query(
    `UPDATE invoices SET status = 'ISSUED', number = $2, issue_date = current_date, issued_at = now(), issued_by_user_id = $3 WHERE id = $1`,
    [invoiceId, number, FIXTURE.users.ana],
  );
}
