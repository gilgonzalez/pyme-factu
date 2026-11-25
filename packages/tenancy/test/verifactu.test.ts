// VERI*FACTU de extremo a extremo en tenancy (Fase 5, ADR-008): emitir genera el registro de alta encadenado en
// la misma transacción; lo que la AEAT rechazaría no se emite; la anulación encadena un registro de anulación; la
// cadena conservada se comprueba. PostgreSQL real con el rol facturalibre_app; datos ficticios.
import { describe, expect, it } from "vitest";
import {
  annulInvoice,
  AuthorizationError,
  createTaxpayer,
  getInvoice,
  issueInvoice,
  listBillingRecords,
  rectifyInvoice,
} from "../src";
import { invoicingWorld, LINE, VERIFACTU, YEAR, type Billing } from "./support";

const { world, billing, draft } = invoicingWorld();

async function issued(b: Billing, extra: Record<string, unknown> = {}): Promise<string> {
  const id = await draft(b, extra);
  const result = await issueInvoice(world.db, await b.ctx(), id, VERIFACTU);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return id;
}

describe("emitir genera el registro de alta", () => {
  it("encadenado: el primero sin huella anterior, el siguiente con la del anterior; la cadena se comprueba", async () => {
    const b = await billing();
    const first = await issued(b);
    const second = await issued(b);

    const detail = await getInvoice(world.db, await b.ctx(), second);
    expect(detail?.verifactu.alta).toMatchObject({ sequence: 2, issuerNif: "12345678Z", invoiceNumber: `F${YEAR}-0002`, importeTotal: "121.00", status: "PENDING" });
    expect(detail?.verifactu.anulacion).toBeNull();

    const { records, checks } = await listBillingRecords(world.db, await b.ctx());
    expect(records.map((record) => [record.sequence, record.kind, record.invoiceId])).toEqual([
      [1, "ALTA", first],
      [2, "ALTA", second],
    ]);
    expect(records[0]?.previousHash).toBeNull();
    expect(records[1]?.previousHash).toBe(records[0]?.hash);
    expect(records[0]?.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(checks).toEqual([
      { sequence: 1, hashOk: true, linkOk: true },
      { sequence: 2, hashOk: true, linkOk: true },
    ]);
  });

  it("guarda el XML oficial del registro, con el número, el destinatario y el sistema informático", async () => {
    const b = await billing();
    const id = await issued(b);
    const row = await world.owner.billingRecord.findFirstOrThrow({ where: { invoiceId: id } });
    expect(row.xml).toContain(`<sf:NumSerieFactura>F${YEAR}-0001</sf:NumSerieFactura>`);
    expect(row.xml).toContain("<sf:IDDestinatario><sf:NombreRazon>Cliente Ficticio SL</sf:NombreRazon><sf:NIF>B12345674</sf:NIF></sf:IDDestinatario>");
    expect(row.xml).toContain("<sf:DescripcionOperacion>Reparación ficticia</sf:DescripcionOperacion>");
    expect(row.xml).toContain(`<sf:NumeroInstalacion>${row.billingSystemId}</sf:NumeroInstalacion>`);
    expect(row.xml).toContain("<sf:IndicadorMultiplesOT>N</sf:IndicadorMultiplesOT>");
  });

  it("una organización con varios contribuyentes: IndicadorMultiplesOT=S", async () => {
    const b = await billing();
    const second = await createTaxpayer(world.db, await b.team.ownerCtx(), { nif: "B12345674", legalName: "Segunda Ficticia SL" });
    expect(second.ok).toBe(true);
    const id = await issued(b);
    const row = await world.owner.billingRecord.findFirstOrThrow({ where: { invoiceId: id } });
    expect(row.xml).toContain("<sf:IndicadorMultiplesOT>S</sf:IndicadorMultiplesOT>");
  });

  it("emitir a la vez varias facturas deja la cadena correcta y sin huecos", async () => {
    const b = await billing();
    const ids = await Promise.all([1, 2, 3, 4].map(() => draft(b)));
    const results = await Promise.all(ids.map(async (id) => issueInvoice(world.db, await b.ctx(), id, VERIFACTU)));
    expect(results.every((result) => result.ok)).toBe(true);
    const { records, checks } = await listBillingRecords(world.db, await b.ctx());
    expect(records.map((record) => record.sequence)).toEqual([1, 2, 3, 4]);
    expect(checks.every((check) => check.hashOk && check.linkOk)).toBe(true);
    // Orden cronológico de generación (art. 7.a de la OM).
    const times = records.map((record) => Date.parse(record.generatedAt));
    expect([...times].sort((x, y) => x - y)).toEqual(times);
  });
});

describe("lo que la AEAT rechazaría no se emite", () => {
  it("un cliente sin NIF no puede recibir una factura completa: la factura sigue siendo borrador", async () => {
    const b = await billing({ legalName: "Particular sin NIF" });
    const id = await draft(b);
    expect(await issueInvoice(world.db, await b.ctx(), id, VERIFACTU)).toEqual({
      ok: false,
      reason: "NOT_REGISTRABLE",
      errors: { recipient: "El cliente necesita NIF: una factura completa debe identificar al destinatario." },
    });
    expect(await getInvoice(world.db, await b.ctx(), id)).toMatchObject({ status: "DRAFT", number: null });
    expect(await world.owner.billingRecord.count({ where: { invoiceId: id } })).toBe(0);
  });

  it("una línea exenta guardada antes de la Fase 5 (sin causa) debe completarse antes de emitir", async () => {
    const b = await billing();
    const id = await draft(b);
    await world.owner.invoiceLine.updateMany({ where: { invoiceId: id }, data: { taxKey: "EXEMPT" } });
    expect(await issueInvoice(world.db, await b.ctx(), id, VERIFACTU)).toEqual({
      ok: false,
      reason: "NOT_REGISTRABLE",
      errors: { details: "Indica la causa de la exención en todas las líneas exentas." },
    });
  });

  it("una exención con causa se registra como operación exenta", async () => {
    const b = await billing();
    const id = await issued(b, { lines: [{ ...LINE, tax: "EXEMPT:E1" }] });
    const row = await world.owner.billingRecord.findFirstOrThrow({ where: { invoiceId: id } });
    expect(row.xml).toContain("<sf:OperacionExenta>E1</sf:OperacionExenta>");
    expect(row).toMatchObject({ cuotaTotal: "0.00", importeTotal: "100.00" });
  });
});

describe("rectificativas", () => {
  it("exigen la clave de rectificación (R1–R4) y se registran por diferencias con la factura rectificada", async () => {
    const b = await billing();
    const original = await issued(b);
    expect(await rectifyInvoice(world.db, await b.ctx(), original, { reason: "Precio erróneo" })).toEqual({
      ok: false,
      reason: "INVALID",
      errors: { code: "Elige el tipo de rectificación." },
    });
    expect(await rectifyInvoice(world.db, await b.ctx(), original, { reason: "Precio erróneo", code: "R5" })).toMatchObject({ ok: false, reason: "INVALID" });
    const correction = await rectifyInvoice(world.db, await b.ctx(), original, { reason: "Precio erróneo", code: "R4" });
    if (!correction.ok) throw new Error(JSON.stringify(correction));
    expect(await getInvoice(world.db, await b.ctx(), correction.invoiceId)).toMatchObject({ rectificationCode: "R4" });
    expect(await issueInvoice(world.db, await b.ctx(), correction.invoiceId, VERIFACTU)).toEqual({ ok: true, number: `R${YEAR}-0001` });
    const row = await world.owner.billingRecord.findFirstOrThrow({ where: { invoiceId: correction.invoiceId } });
    expect(row).toMatchObject({ invoiceType: "R4", cuotaTotal: "-21.00", importeTotal: "-121.00" });
    expect(row.xml).toContain(`<sf:TipoRectificativa>I</sf:TipoRectificativa><sf:FacturasRectificadas><sf:IDFacturaRectificada><sf:IDEmisorFactura>12345678Z</sf:IDEmisorFactura><sf:NumSerieFactura>F${YEAR}-0001</sf:NumSerieFactura>`);
  });
});

describe("anulación (factura expedida por error)", () => {
  it("encadena un registro de anulación; no se anula dos veces ni se rectifica lo anulado", async () => {
    const b = await billing();
    const id = await issued(b);
    expect(await annulInvoice(world.db, await b.ctx(), id, { reason: "Expedida por error: no hubo venta" }, VERIFACTU)).toEqual({ ok: true });

    const detail = await getInvoice(world.db, await b.ctx(), id);
    expect(detail?.verifactu.anulacion).toMatchObject({ sequence: 2 });
    const { records, checks } = await listBillingRecords(world.db, await b.ctx());
    expect(records.map((record) => record.kind)).toEqual(["ALTA", "ANULACION"]);
    expect(checks.every((check) => check.hashOk && check.linkOk)).toBe(true);

    expect(await annulInvoice(world.db, await b.ctx(), id, { reason: "Otra vez" }, VERIFACTU)).toEqual({ ok: false, reason: "ALREADY_ANNULLED" });
    expect(await rectifyInvoice(world.db, await b.ctx(), id, { reason: "x", code: "R1" })).toEqual({ ok: false, reason: "ANNULLED" });
  });

  it("solo facturas emitidas y registradas, con motivo y con permiso para corregir", async () => {
    const b = await billing();
    const draftId = await draft(b);
    expect(await annulInvoice(world.db, await b.ctx(), draftId, { reason: "x" }, VERIFACTU)).toEqual({ ok: false, reason: "NOT_ISSUED" });
    expect(await annulInvoice(world.db, await b.ctx(), "no-es-un-uuid", { reason: "x" }, VERIFACTU)).toEqual({ ok: false, reason: "NOT_FOUND" });
    const id = await issued(b);
    expect(await annulInvoice(world.db, await b.ctx(), id, { reason: " " }, VERIFACTU)).toEqual({
      ok: false,
      reason: "INVALID",
      errors: { reason: "Explica por qué se anula la factura." },
    });
    // Una factura emitida antes de la Fase 5 no tiene registro de alta que anular.
    const legacy = await draft(b);
    await world.owner.invoice.updateMany({ where: { id: legacy }, data: { status: "ISSUED", number: 999, issueDate: new Date(), issuedAt: new Date() } });
    expect(await annulInvoice(world.db, await b.ctx(), legacy, { reason: "x" }, VERIFACTU)).toEqual({ ok: false, reason: "NOT_REGISTERED" });

    const employee = await b.team.add("EMPLOYEE");
    await expect(annulInvoice(world.db, await employee.ctx(b.taxpayerId), id, { reason: "x" }, VERIFACTU)).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("consulta de registros", () => {
  it("quien solo puede leer ve los registros; nadie ve los de otro contribuyente", async () => {
    const b = await billing();
    await issued(b);
    const viewer = await b.team.add("VIEWER");
    expect((await listBillingRecords(world.db, await viewer.ctx(b.taxpayerId))).records).toHaveLength(1);

    const other = await billing();
    expect((await listBillingRecords(world.db, await other.ctx())).records).toHaveLength(0);
  });
});
