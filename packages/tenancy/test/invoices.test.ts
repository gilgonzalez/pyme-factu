// Facturación de extremo a extremo en tenancy: clientes, productos, borradores, emisión con numeración
// correlativa y rectificativas, contra PostgreSQL real (rol facturalibre_app). Datos ficticios.
import { describe, expect, it } from "vitest";
import {
  AuthorizationError,
  createCustomer,
  createDraftInvoice,
  createProduct,
  deleteDraftInvoice,
  getInvoice,
  issueInvoice,
  listCustomers,
  listInvoices,
  listProducts,
  rectifyInvoice,
  setTaxpayerAccess,
  updateDraftInvoice,
} from "../src";
import { invoicingWorld, LINE, VERIFACTU, YEAR } from "./support";

const { world, billing, draft } = invoicingWorld();

describe("clientes y productos", () => {
  it("se dan de alta por contribuyente, con NIF opcional pero válido", async () => {
    const b = await billing();
    const ctx = await b.ctx();
    expect(await createCustomer(world.db, ctx, { legalName: "Particular sin NIF" })).toMatchObject({ ok: true });
    expect(await createCustomer(world.db, ctx, { legalName: "Mal", nif: "B12345675" })).toEqual({
      ok: false,
      reason: "INVALID",
      errors: { nif: "El NIF no es válido: revisa el último carácter (control)." },
    });
    expect(await createCustomer(world.db, ctx, { legalName: "Repetido", nif: "B12345674" })).toEqual({ ok: false, reason: "NIF_TAKEN" });
    expect((await listCustomers(world.db, ctx)).map((customer) => customer.legalName)).toEqual(["Cliente Ficticio SL", "Particular sin NIF"]);

    expect(await createProduct(world.db, ctx, { name: "Hora de trabajo", unitPrice: "35,5", tax: "VAT:2100" })).toMatchObject({ ok: true });
    expect(await createProduct(world.db, ctx, { name: "", unitPrice: "-1", tax: "X" })).toMatchObject({ ok: false, reason: "INVALID" });
    const products = await listProducts(world.db, ctx);
    expect(products.map(({ name, unitPrice, taxKey }) => ({ name, unitPrice, taxKey }))).toEqual([{ name: "Hora de trabajo", unitPrice: 355_000n, taxKey: "VAT:2100" }]);
  });
});

describe("borradores", () => {
  it("calcula y guarda los importes con fiscal-core", async () => {
    const b = await billing();
    const id = await draft(b, { withholdingPercent: "15" });
    const invoice = await getInvoice(world.db, await b.ctx(), id);
    expect(invoice).toMatchObject({ status: "DRAFT", kind: "STANDARD", number: null, taxableBase: 10000n, vatTotal: 2100n, withholdingAmount: 1500n, total: 10600n });
    expect(invoice?.lines.map(({ position, description, quantity, unitPrice, lineBase }) => ({ position, description, quantity, unitPrice, lineBase }))).toEqual([
      { position: 1, description: "Reparación ficticia", quantity: 2000n, unitPrice: 500_000n, lineBase: 10000n },
    ]);
  });

  it("aplica el recargo de equivalencia si el cliente está en ese régimen", async () => {
    const b = await billing({ legalName: "Comercio Minorista Ficticio", equivalenceSurcharge: "on" });
    const invoice = await getInvoice(world.db, await b.ctx(), await draft(b));
    expect(invoice).toMatchObject({ equivalenceSurcharge: true, surchargeTotal: 520n, total: 12620n });
  });

  it("explica los errores de cada línea y del cliente", async () => {
    const b = await billing();
    const result = await createDraftInvoice(world.db, await b.ctx(), {
      customerId: "00000000-0000-7000-8000-000000000000",
      lines: [LINE, { ...LINE, quantity: "0" }],
      withholdingPercent: "120",
    });
    expect(result).toEqual({
      ok: false,
      reason: "INVALID",
      errors: {
        customerId: "Elige un cliente.",
        "lines.1.quantity": "La cantidad no puede ser cero.",
        withholdingPercent: "La retención debe estar entre 0 y 100 %.",
      },
    });
    expect(await createDraftInvoice(world.db, await b.ctx(), { customerId: b.customerId, lines: [] })).toEqual({
      ok: false,
      reason: "INVALID",
      errors: { lines: "Añade al menos una línea." },
    });
  });

  it("se editan y se borran mientras son borradores", async () => {
    const b = await billing();
    const id = await draft(b);
    expect(await updateDraftInvoice(world.db, await b.ctx(), id, { customerId: b.customerId, lines: [{ ...LINE, quantity: "3" }] })).toEqual({ ok: true });
    expect((await getInvoice(world.db, await b.ctx(), id))?.taxableBase).toBe(15000n);
    expect(await deleteDraftInvoice(world.db, await b.ctx(), id)).toEqual({ ok: true });
    expect(await getInvoice(world.db, await b.ctx(), id)).toBeNull();
  });
});

describe("emisión y numeración", () => {
  it("numera de forma correlativa en la serie del año y fija emisor y destinatario", async () => {
    const b = await billing();
    const first = await issueInvoice(world.db, await b.ctx(), await draft(b), VERIFACTU);
    const second = await issueInvoice(world.db, await b.ctx(), await draft(b), VERIFACTU);
    expect(first).toEqual({ ok: true, number: `F${YEAR}-0001` });
    expect(second).toEqual({ ok: true, number: `F${YEAR}-0002` });

    const [latest] = await listInvoices(world.db, await b.ctx());
    expect(latest).toMatchObject({ status: "ISSUED", number: `F${YEAR}-0002`, customerName: "Cliente Ficticio SL", total: 12100n });
    const issued = await getInvoice(world.db, await b.ctx(), latest?.id ?? "");
    expect(issued?.issuerSnapshot).toMatchObject({ nif: "12345678Z", legalName: "Ana Ficticia Pérez", city: "Madrid" });
    expect(issued?.customerSnapshot).toMatchObject({ nif: "B12345674", legalName: "Cliente Ficticio SL" });
    expect(await world.owner.auditEvent.count({ where: { action: "invoice.issued", entityId: latest?.id ?? "" } })).toBe(1);
  });

  it("emitir a la vez varios borradores nunca repite número", async () => {
    const b = await billing();
    const ids = await Promise.all([draft(b), draft(b), draft(b)]);
    const results = await Promise.all(ids.map(async (id) => issueInvoice(world.db, await b.ctx(), id, VERIFACTU)));
    const numbers = results.map((result) => (result.ok ? result.number : result.reason)).sort();
    expect(numbers).toEqual([`F${YEAR}-0001`, `F${YEAR}-0002`, `F${YEAR}-0003`]);
  });

  it("una factura emitida no se edita, no se borra ni se vuelve a emitir", async () => {
    const b = await billing();
    const id = await draft(b);
    await issueInvoice(world.db, await b.ctx(), id, VERIFACTU);
    const ctx = await b.ctx();
    expect(await updateDraftInvoice(world.db, ctx, id, { customerId: b.customerId, lines: [LINE] })).toEqual({ ok: false, reason: "NOT_DRAFT" });
    expect(await deleteDraftInvoice(world.db, ctx, id)).toEqual({ ok: false, reason: "NOT_DRAFT" });
    expect(await issueInvoice(world.db, ctx, id, VERIFACTU)).toEqual({ ok: false, reason: "NOT_DRAFT" });
  });

  it("un EMPLOYEE prepara borradores pero no emite; con solo lectura no prepara nada", async () => {
    const b = await billing();
    const employee = await b.team.add("EMPLOYEE");
    const employeeCtx = await employee.ctx(b.taxpayerId);
    const result = await createDraftInvoice(world.db, employeeCtx, { customerId: b.customerId, lines: [LINE] });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    await expect(issueInvoice(world.db, employeeCtx, result.invoiceId, VERIFACTU)).rejects.toBeInstanceOf(AuthorizationError);

    const viewer = await b.team.add("ACCOUNTANT", "ASSIGNED_TAXPAYERS");
    await setTaxpayerAccess(world.db, await b.team.ownerCtx(), { taxpayerId: b.taxpayerId, membershipId: viewer.membershipId, access: "READ_ONLY" });
    const readOnly = await viewer.ctx(b.taxpayerId);
    expect(await listInvoices(world.db, readOnly)).toHaveLength(1);
    await expect(createDraftInvoice(world.db, readOnly, { customerId: b.customerId, lines: [LINE] })).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("rectificativas", () => {
  it("rectificar crea un borrador por diferencias en la serie de rectificativas, que se numera aparte", async () => {
    const b = await billing();
    const original = await draft(b);
    await issueInvoice(world.db, await b.ctx(), original, VERIFACTU);

    const rectified = await rectifyInvoice(world.db, await b.ctx(), original, { reason: "Importe facturado por error", code: "R1" });
    expect(rectified).toMatchObject({ ok: true });
    if (!rectified.ok) return;
    const correction = await getInvoice(world.db, await b.ctx(), rectified.invoiceId);
    expect(correction).toMatchObject({
      kind: "RECTIFYING",
      status: "DRAFT",
      rectifiesInvoiceId: original,
      rectifiesNumber: `F${YEAR}-0001`,
      rectificationReason: "Importe facturado por error",
      taxableBase: -10000n,
      total: -12100n,
    });
    expect(await issueInvoice(world.db, await b.ctx(), rectified.invoiceId, VERIFACTU)).toEqual({ ok: true, number: `R${YEAR}-0001` });
  });

  it("solo se rectifican facturas emitidas y con un motivo", async () => {
    const b = await billing();
    const id = await draft(b);
    expect(await rectifyInvoice(world.db, await b.ctx(), id, { reason: "x", code: "R1" })).toEqual({ ok: false, reason: "NOT_ISSUED" });
    await issueInvoice(world.db, await b.ctx(), id, VERIFACTU);
    expect(await rectifyInvoice(world.db, await b.ctx(), id, { reason: "  ", code: "R1" })).toEqual({
      ok: false,
      reason: "INVALID",
      errors: { reason: "Explica el motivo de la rectificación." },
    });
  });
});
