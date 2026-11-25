// Remisión de extremo a extremo (Fase 6): facturas emitidas con tenancy (rol app) → el worker (rol worker) las
// remite al simulador local → estado de cada registro, control de flujo e incidencias. PostgreSQL real; datos
// ficticios. Nunca se contacta con la AEAT.
import { randomBytes, randomUUID } from "node:crypto";
import { createSimulator, sealCertificate, simulatorTransport, type Transport } from "@facturalibre/aeat-client";
import { createDatabaseClient, type Database } from "@facturalibre/database";
import type {} from "@facturalibre/database/testing";
import { annulInvoice, createCustomer, createDraftInvoice, createOrganization, createTaxpayer, issueInvoice, resolveTenantContext, type TenantContext } from "@facturalibre/tenancy";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { runSubmissionCycle, transportResolver, type TransportResolver } from "../src/submitter";

let app: Database;
let owner: Database;
let worker: Database;

beforeAll(() => {
  const urls = inject("dbUrls");
  app = createDatabaseClient(urls.app, { maxConnections: 2 });
  owner = createDatabaseClient(urls.owner, { maxConnections: 1 });
  worker = createDatabaseClient(urls.worker, { maxConnections: 1 });
});
afterAll(async () => {
  await Promise.all([app.$disconnect(), owner.$disconnect(), worker.$disconnect()]);
});

const SETTINGS = { software: { producerName: "Productor Ficticio SL", producerNif: "B12345674", name: "FacturaLibre", id: "FL", version: "0.6.0-test" } };

interface Billing {
  readonly taxpayerId: string;
  readonly ctx: () => Promise<TenantContext>;
  readonly customerId: string;
}

/** Organización, contribuyente y cliente nuevos (cada prueba, su propia facturación). */
async function billing(): Promise<Billing> {
  const user = await owner.user.create({ data: { name: "Ana Ficticia", email: `ana-${randomUUID()}@example.test`, emailVerified: true } });
  const slug = `org-${randomUUID().slice(0, 8)}`;
  await createOrganization(app, user.id, { name: "Organización ficticia", slug });
  const context = async (taxpayerId: string | null): Promise<TenantContext> => {
    const result = await resolveTenantContext(app, { userId: user.id, tenantSlug: slug, taxpayerId, requestId: "test" });
    if (!result.ok) throw new Error(result.reason);
    return result.context;
  };
  const taxpayer = await createTaxpayer(app, await context(null), { nif: "12345678Z", legalName: "Ana Ficticia Pérez" });
  if (!taxpayer.ok) throw new Error(taxpayer.reason);
  const ctx = () => context(taxpayer.taxpayer.id);
  const customer = await createCustomer(app, await ctx(), { legalName: "Cliente Ficticio SL", nif: "B12345674" });
  if (!customer.ok) throw new Error(customer.reason);
  return { taxpayerId: taxpayer.taxpayer.id, ctx, customerId: customer.customer.id };
}

async function issue(b: Billing): Promise<void> {
  const draft = await createDraftInvoice(app, await b.ctx(), { customerId: b.customerId, lines: [{ description: "Servicio", quantity: "1", unitPrice: "100", tax: "VAT:2100" }] });
  if (!draft.ok) throw new Error(JSON.stringify(draft));
  const issued = await issueInvoice(app, await b.ctx(), draft.invoiceId, SETTINGS);
  if (!issued.ok) throw new Error(JSON.stringify(issued));
}

const records = (b: Billing) => owner.billingRecord.findMany({ where: { taxpayerId: b.taxpayerId }, orderBy: { sequence: "asc" } });
const system = (b: Billing) => owner.billingSystem.findUniqueOrThrow({ where: { taxpayerId: b.taxpayerId } });
const always = (transport: Transport): TransportResolver => () => Promise.resolve({ ok: true, transport });
const secondsUntil = (date: Date | null): number => ((date?.getTime() ?? 0) - Date.now()) / 1000;

/** Transporte al simulador que además guarda cada sobre enviado. */
function recordingSimulator(waitSeconds = 60): { transport: Transport; sent: string[] } {
  const sent: string[] = [];
  const simulator = simulatorTransport(createSimulator(waitSeconds));
  return {
    sent,
    transport: (envelope) => {
      sent.push(envelope);
      return simulator(envelope);
    },
  };
}

describe("remisión al simulador", () => {
  it("envía los registros pendientes en orden; quedan aceptados con su CSV y el siguiente envío espera lo que indica la AEAT", async () => {
    const b = await billing();
    await issue(b);
    await issue(b);
    const { transport, sent } = recordingSimulator(90);
    expect(await runSubmissionCycle(worker, always(transport))).toBeGreaterThanOrEqual(1);

    const rows = await records(b);
    expect(rows.map((row) => row.status)).toEqual(["ACCEPTED", "ACCEPTED"]);
    expect(rows.every((row) => row.attempts === 1 && row.submittedAt !== null && /^[0-9A-F]{16}$/.test(row.aeatCsv ?? ""))).toBe(true);
    const mine = sent.find((envelope) => envelope.includes(rows[0]?.hash ?? "-")) ?? "";
    expect(mine.indexOf(rows[0]?.hash ?? "")).toBeLessThan(mine.indexOf(rows[1]?.hash ?? ""));
    expect(mine).not.toContain("<sf:Incidencia>");

    const state = await system(b);
    expect(state).toMatchObject({ waitSeconds: 90, consecutiveFailures: 0, failingSince: null, lastError: null });
    expect(secondsUntil(state.nextSendAt)).toBeGreaterThan(80);

    // Control de flujo: hasta que pase el tiempo de espera, lo nuevo no se envía.
    await issue(b);
    await runSubmissionCycle(worker, always(transport));
    expect((await records(b)).at(-1)?.status).toBe("PENDING");
  });

  it("sin conexión: los registros siguen pendientes, consta la incidencia y el siguiente envío la declara (art. 16.4)", async () => {
    const b = await billing();
    await issue(b);
    const offline: Transport = () => Promise.reject(new Error("ECONNREFUSED"));
    await runSubmissionCycle(worker, always(offline));
    expect((await records(b)).map((row) => [row.status, row.attempts])).toEqual([["PENDING", 1]]);
    const failing = await system(b);
    expect(failing).toMatchObject({ consecutiveFailures: 1, lastError: "Sin conexión con la AEAT: ECONNREFUSED" });
    expect(failing.failingSince).not.toBeNull();
    expect(secondsUntil(failing.nextSendAt)).toBeGreaterThan(50);
    expect(secondsUntil(failing.nextSendAt)).toBeLessThanOrEqual(60);

    // Llega el turno del reintento: se reenvía el MISMO registro y se declara la incidencia.
    await owner.billingSystem.update({ where: { id: failing.id }, data: { nextSendAt: new Date(Date.now() - 1000) } });
    const { transport, sent } = recordingSimulator();
    await runSubmissionCycle(worker, always(transport));
    const [row] = await records(b);
    expect(row).toMatchObject({ status: "ACCEPTED", attempts: 2 });
    expect(sent.find((envelope) => envelope.includes(row?.hash ?? "-"))).toContain("<sf:RemisionVoluntaria><sf:Incidencia>S</sf:Incidencia></sf:RemisionVoluntaria>");
    expect(await system(b)).toMatchObject({ consecutiveFailures: 0, failingSince: null, lastError: null });
  });

  it("si se perdió la respuesta, el reenvío se rechaza por duplicado y el registro consta como aceptado", async () => {
    const b = await billing();
    await issue(b);
    const simulator = createSimulator();
    await runSubmissionCycle(worker, always(simulatorTransport(simulator)));
    // La respuesta «se pierde»: el registro vuelve a pendiente y llega su turno.
    const [sentOnce] = await records(b);
    await owner.billingRecord.update({ where: { id: sentOnce?.id ?? "" }, data: { status: "PENDING", submittedAt: null, aeatCsv: null } });
    await owner.billingSystem.update({ where: { taxpayerId: b.taxpayerId }, data: { nextSendAt: null } });
    await runSubmissionCycle(worker, always(simulatorTransport(simulator)));
    expect((await records(b))[0]).toMatchObject({ status: "ACCEPTED", aeatErrorCode: "3000" });
  });

  it("un registro rechazado queda rechazado con el código y la descripción oficiales", async () => {
    const b = await billing();
    await issue(b);
    await runSubmissionCycle(worker, always(simulatorTransport(createSimulator())));
    const [alta] = await records(b);
    expect(await annulInvoice(app, await b.ctx(), alta?.invoiceId ?? "", { reason: "Expedida por error" }, SETTINGS)).toEqual({ ok: true });
    await owner.billingSystem.update({ where: { taxpayerId: b.taxpayerId }, data: { nextSendAt: null } });
    // Otro simulador no conoce el alta: rechaza la anulación (3002).
    await runSubmissionCycle(worker, always(simulatorTransport(createSimulator())));
    expect((await records(b))[1]).toMatchObject({ kind: "ANULACION", status: "REJECTED", aeatErrorCode: "3002", aeatErrorDescription: "No existe el registro de facturación.", aeatCsv: null });
  });

  it("lo que no se arregla reintentando (falta de certificado) se revisa y se reintenta cada hora", async () => {
    const b = await billing();
    await issue(b);
    await runSubmissionCycle(worker, () => Promise.resolve({ ok: false, reason: "Falta el certificado electrónico del contribuyente para remitir a la AEAT." }));
    const state = await system(b);
    expect(state).toMatchObject({ lastError: "Falta el certificado electrónico del contribuyente para remitir a la AEAT.", consecutiveFailures: 1 });
    expect(secondsUntil(state.nextSendAt)).toBeGreaterThan(3500);
    expect((await records(b))[0]).toMatchObject({ status: "PENDING", attempts: 0 });
  });

  it("un Fault de cliente también se revisa antes de reenviar (cada hora)", async () => {
    const b = await billing();
    await issue(b);
    const clientFault: Transport = () =>
      Promise.resolve({
        status: 500,
        body: `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>4112 = El titular del certificado debe ser Obligado Emisión, Colaborador Social, Apoderado o Sucesor.</faultstring></s:Fault></s:Body></s:Envelope>`,
      });
    await runSubmissionCycle(worker, always(clientFault));
    const state = await system(b);
    expect(state.lastError).toBe("La AEAT rechazó el envío: 4112 = El titular del certificado debe ser Obligado Emisión, Colaborador Social, Apoderado o Sucesor.");
    expect(secondsUntil(state.nextSendAt)).toBeGreaterThan(3500);
  });
});

describe("transporte según el entorno (R-19)", () => {
  const simulator = simulatorTransport(createSimulator());

  it("en desarrollo (o sin definir) siempre el simulador, aunque no haya certificado ni clave", async () => {
    for (const environment of ["development", undefined]) {
      expect(await transportResolver(worker, environment, null, simulator)("cualquiera")).toEqual({ ok: true, transport: simulator });
    }
  });

  it("en pruebas o producción hacen falta la clave de cifrado y el certificado del contribuyente", async () => {
    const b = await billing();
    expect(await transportResolver(worker, "test", null, simulator)(b.taxpayerId)).toEqual({
      ok: false,
      reason: "Falta CERTIFICATE_KEK: no se pueden usar los certificados para remitir a la AEAT.",
    });
    const kek = randomBytes(32);
    expect(await transportResolver(worker, "production", kek, simulator)(b.taxpayerId)).toEqual({
      ok: false,
      reason: "Falta el certificado electrónico del contribuyente para remitir a la AEAT.",
    });
    const tenantId = (await owner.taxpayer.findUniqueOrThrow({ where: { id: b.taxpayerId } })).tenantId;
    await owner.taxpayerCertificate.create({ data: { tenantId, taxpayerId: b.taxpayerId, sealed: sealCertificate(kek, { pfx: Buffer.from("ficticio"), passphrase: "x" }) } });
    const choice = await transportResolver(worker, "test", kek, simulator)(b.taxpayerId);
    expect(choice.ok && choice.transport !== simulator).toBe(true);
  });
});
