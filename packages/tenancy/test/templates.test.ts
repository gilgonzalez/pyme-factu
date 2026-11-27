// Plantillas de factura: lo que se repite (cliente opcional, líneas, retención, observaciones) con un nombre
// para reutilizarlo. Contra PostgreSQL real (rol facturalibre_app). Datos ficticios.
import { describe, expect, it } from "vitest";
import { AuthorizationError, deleteInvoiceTemplate, getInvoiceTemplate, listInvoiceTemplates, saveInvoiceTemplate } from "../src";
import { invoicingWorld, LINE } from "./support";

const { world, billing } = invoicingWorld();

const MAINTENANCE = { name: "Mantenimiento mensual", lines: [LINE], withholdingPercent: "15", notes: "Pago a 30 días" };

function saved(result: Awaited<ReturnType<typeof saveInvoiceTemplate>>): string {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.templateId;
}

describe("plantillas de factura", () => {
  it("se guardan con un nombre, con o sin cliente, y se listan por nombre con su importe", async () => {
    const b = await billing();
    const ctx = await b.ctx();
    const withCustomer = saved(await saveInvoiceTemplate(world.db, ctx, null, { ...MAINTENANCE, customerId: b.customerId }));
    saved(await saveInvoiceTemplate(world.db, ctx, null, { name: "Hora suelta", lines: [{ ...LINE, quantity: "1" }] }));

    expect(await listInvoiceTemplates(world.db, ctx)).toEqual([
      { id: expect.any(String) as string, name: "Hora suelta", customerName: null, lineCount: 1, total: 6050n },
      { id: withCustomer, name: "Mantenimiento mensual", customerName: "Cliente Ficticio SL", lineCount: 1, total: 10600n },
    ]);
    expect(await getInvoiceTemplate(world.db, ctx, withCustomer)).toEqual({
      id: withCustomer,
      name: "Mantenimiento mensual",
      customerId: b.customerId,
      withholdingPercent: 1500n,
      notes: "Pago a 30 días",
      lines: [{ description: "Reparación ficticia", quantity: 2000n, unitPrice: 500_000n, discountPercent: 0n, taxKey: "VAT:2100" }],
    });
  });

  it("explica qué falta: nombre, líneas válidas, cliente existente; el nombre no se repite", async () => {
    const b = await billing();
    const ctx = await b.ctx();
    expect(
      await saveInvoiceTemplate(world.db, ctx, null, {
        name: "  ",
        customerId: "00000000-0000-7000-8000-000000000000",
        lines: [{ ...LINE, quantity: "0" }],
      }),
    ).toEqual({
      ok: false,
      reason: "INVALID",
      errors: {
        name: "Ponle un nombre para encontrarla después.",
        customerId: "Ese cliente ya no existe.",
        "lines.0.quantity": "La cantidad no puede ser cero.",
      },
    });
    expect(await saveInvoiceTemplate(world.db, ctx, null, { name: "x".repeat(81), lines: [LINE] })).toMatchObject({
      errors: { name: "El nombre no puede superar los 80 caracteres." },
    });

    saved(await saveInvoiceTemplate(world.db, ctx, null, MAINTENANCE));
    expect(await saveInvoiceTemplate(world.db, ctx, null, { ...MAINTENANCE, name: "MANTENIMIENTO MENSUAL" })).toEqual({
      ok: false,
      reason: "INVALID",
      errors: { name: "Ya tienes una plantilla con ese nombre." },
    });
  });

  it("se edita (nombre, cliente y líneas) y se borra", async () => {
    const b = await billing();
    const ctx = await b.ctx();
    const id = saved(await saveInvoiceTemplate(world.db, ctx, null, MAINTENANCE));
    saved(
      await saveInvoiceTemplate(world.db, ctx, id, {
        name: "Mantenimiento trimestral",
        customerId: b.customerId,
        lines: [LINE, { ...LINE, description: "Desplazamiento", quantity: "1", unitPrice: "20" }],
      }),
    );
    const edited = await getInvoiceTemplate(world.db, ctx, id);
    expect(edited).toMatchObject({ name: "Mantenimiento trimestral", customerId: b.customerId, withholdingPercent: 0n, notes: null });
    expect(edited?.lines.map((line) => line.description)).toEqual(["Reparación ficticia", "Desplazamiento"]);

    expect(await deleteInvoiceTemplate(world.db, ctx, id)).toEqual({ ok: true });
    expect(await getInvoiceTemplate(world.db, ctx, id)).toBeNull();
    expect(await deleteInvoiceTemplate(world.db, ctx, id)).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(await saveInvoiceTemplate(world.db, ctx, id, MAINTENANCE)).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("quien solo puede leer facturas las ve pero no las crea ni las borra; otro contribuyente no las ve", async () => {
    const b = await billing();
    const id = saved(await saveInvoiceTemplate(world.db, await b.ctx(), null, MAINTENANCE));
    const viewer = await (await b.team.add("VIEWER")).ctx(b.taxpayerId);
    expect((await listInvoiceTemplates(world.db, viewer)).map((template) => template.name)).toEqual(["Mantenimiento mensual"]);
    await expect(saveInvoiceTemplate(world.db, viewer, null, { ...MAINTENANCE, name: "Otra" })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(deleteInvoiceTemplate(world.db, viewer, id)).rejects.toBeInstanceOf(AuthorizationError);

    const other = await billing();
    expect(await listInvoiceTemplates(world.db, await other.ctx())).toEqual([]);
    expect(await getInvoiceTemplate(world.db, await other.ctx(), id)).toBeNull();
  });
});
