// Certificado del contribuyente para remitir a la AEAT y estado de la remisión (Fase 6). PostgreSQL real con el
// rol facturalibre_app; certificados FICTICIOS generados en memoria (nunca reales).
import { randomBytes } from "node:crypto";
import { openCertificate } from "@facturalibre/aeat-client";
import { fictitiousCertificate } from "@facturalibre/aeat-client/testing";
import { beforeAll, describe, expect, it } from "vitest";
import { AuthorizationError, certificateStatus, deleteCertificate, issueInvoice, saveCertificate, submissionStatus } from "../src";
import { invoicingWorld, VERIFACTU } from "./support";

const { world, billing, draft } = invoicingWorld();
const kek = randomBytes(32);
const PASSPHRASE = "contraseña-ficticia";
let pfx: Buffer;

beforeAll(() => {
  pfx = fictitiousCertificate("Ana Ficticia Pérez - 12345678Z", PASSPHRASE).pfx;
});

describe("certificado del contribuyente", () => {
  it("se guarda cifrado (solo se abre con la KEK), se sustituye y se borra", async () => {
    const b = await billing();
    const ctx = await b.ctx();
    expect(await certificateStatus(world.db, ctx)).toBeNull();
    expect(await saveCertificate(world.db, ctx, { pfx, passphrase: PASSPHRASE }, kek)).toEqual({ ok: true });

    const stored = await world.owner.taxpayerCertificate.findUniqueOrThrow({ where: { taxpayerId: b.taxpayerId } });
    expect(stored.sealed).not.toContain(PASSPHRASE);
    expect(openCertificate(kek, stored.sealed)).toEqual({ pfx, passphrase: PASSPHRASE });
    expect(() => openCertificate(randomBytes(32), stored.sealed)).toThrow();
    const status = await certificateStatus(world.db, ctx);
    expect(status?.updatedAt).toBeInstanceOf(Date);

    // Sustituir: sigue habiendo uno, el nuevo.
    const other = fictitiousCertificate("Ana Ficticia Pérez - 12345678Z", "otra-ficticia").pfx;
    expect(await saveCertificate(world.db, ctx, { pfx: other, passphrase: "otra-ficticia" }, kek)).toEqual({ ok: true });
    expect(await world.owner.taxpayerCertificate.count({ where: { taxpayerId: b.taxpayerId } })).toBe(1);

    expect(await deleteCertificate(world.db, ctx)).toEqual({ ok: true });
    expect(await certificateStatus(world.db, ctx)).toBeNull();
    const actions = await world.owner.auditEvent.findMany({ where: { entityType: "taxpayer", entityId: b.taxpayerId, action: { startsWith: "certificate." } }, select: { action: true } });
    expect(actions.map((event) => event.action).sort()).toEqual(["certificate.deleted", "certificate.saved", "certificate.saved"]);
  });

  it("no se guarda un fichero que no abre con su contraseña o que no es PKCS#12", async () => {
    const b = await billing();
    const ctx = await b.ctx();
    const invalid = { ok: false, reason: "INVALID", errors: { certificate: "El certificado no se abre con esa contraseña o no es un fichero .p12/.pfx." } };
    expect(await saveCertificate(world.db, ctx, { pfx, passphrase: "equivocada" }, kek)).toEqual(invalid);
    expect(await saveCertificate(world.db, ctx, { pfx: Buffer.from("no es un certificado"), passphrase: PASSPHRASE }, kek)).toEqual(invalid);
    expect(await saveCertificate(world.db, ctx, { pfx: Buffer.alloc(0), passphrase: PASSPHRASE }, kek)).toEqual(invalid);
    expect(await certificateStatus(world.db, ctx)).toBeNull();
  });

  it("solo quien administra el contribuyente (propietario o administrador) lo gestiona", async () => {
    const b = await billing();
    const accountant = await b.team.add("ACCOUNTANT");
    const ctx = await accountant.ctx(b.taxpayerId);
    await expect(saveCertificate(world.db, ctx, { pfx, passphrase: PASSPHRASE }, kek)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(certificateStatus(world.db, ctx)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(deleteCertificate(world.db, ctx)).rejects.toBeInstanceOf(AuthorizationError);
    const admin = await b.team.add("ADMIN");
    expect(await saveCertificate(world.db, await admin.ctx(b.taxpayerId), { pfx, passphrase: PASSPHRASE }, kek)).toEqual({ ok: true });
  });
});

describe("estado de la remisión (avisos del art. 16.4)", () => {
  it("sin registros: nada pendiente ni incidencia", async () => {
    const b = await billing();
    expect(await submissionStatus(world.db, await b.ctx())).toEqual({ pending: 0, rejected: 0, failingSince: null, lastError: null });
  });

  it("cuenta lo pendiente y lo rechazado e informa de la incidencia en curso (también a quien solo lee)", async () => {
    const b = await billing();
    for (let index = 0; index < 3; index += 1) await issueInvoice(world.db, await b.ctx(), await draft(b), VERIFACTU);
    const since = new Date("2026-11-25T08:00:00Z");
    await world.owner.billingSystem.update({ where: { taxpayerId: b.taxpayerId }, data: { failingSince: since, lastError: "Sin conexión con la AEAT" } });
    const [first] = await world.owner.billingRecord.findMany({ where: { taxpayerId: b.taxpayerId }, orderBy: { sequence: "asc" } });
    await world.owner.billingRecord.update({ where: { id: first?.id ?? "" }, data: { status: "REJECTED", submittedAt: new Date() } });
    const viewer = await b.team.add("VIEWER");
    expect(await submissionStatus(world.db, await viewer.ctx(b.taxpayerId))).toEqual({ pending: 2, rejected: 1, failingSince: since, lastError: "Sin conexión con la AEAT" });
  });
});
