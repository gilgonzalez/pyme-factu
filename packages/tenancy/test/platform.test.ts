// Administración de la plataforma desde tenancy: panel, suspensiones y modo soporte de solo lectura, contra
// PostgreSQL real con el rol de la aplicación. Datos ficticios.
import { describe, expect, it } from "vitest";
import {
  AuthorizationError,
  createDraftInvoice,
  isPlatformAdmin,
  listInvoices,
  listPlatformTenants,
  listPlatformUsers,
  listVerifactuStatus,
  openSupportContext,
  PlatformAdminRequiredError,
  platformOverview,
  resolveTenantContext,
  setTenantSuspension,
  setUserSuspension,
} from "../src";
import { invoicingWorld } from "./support";

const { world, billing, draft } = invoicingWorld();

async function admin(): Promise<string> {
  const user = await world.createUser();
  await world.owner.platformAdmin.create({ data: { userId: user.id } });
  return user.id;
}

describe("quién administra", () => {
  it("solo quien está en la tabla de administradores lo es", async () => {
    const adminId = await admin();
    const normal = await world.createUser();
    expect(await isPlatformAdmin(world.db, adminId)).toBe(true);
    expect(await isPlatformAdmin(world.db, normal.id)).toBe(false);
  });
});

describe("panel", () => {
  it("el administrador ve las organizaciones y las cuentas; los demás, nada", async () => {
    const adminId = await admin();
    const b = await billing();
    await draft(b);
    const tenants = await listPlatformTenants(world.db, adminId);
    expect(tenants.find((tenant) => tenant.slug === b.team.slug)).toMatchObject({ members: 1, taxpayers: 1, draftInvoices: 1, issuedInvoices: 0, suspendedAt: null });
    const users = await listPlatformUsers(world.db, adminId);
    expect(users.find((user) => user.id === adminId)).toMatchObject({ isAdmin: true, suspendedAt: null });
    expect((await platformOverview(world.db, adminId)).tenants).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(await listVerifactuStatus(world.db, adminId))).toBe(true);

    const normal = await world.createUser();
    await expect(listPlatformTenants(world.db, normal.id)).rejects.toBeInstanceOf(PlatformAdminRequiredError);
    await expect(platformOverview(world.db, normal.id)).rejects.toBeInstanceOf(PlatformAdminRequiredError);
  });
});

describe("suspensiones", () => {
  it("una organización suspendida no se abre para sus miembros hasta que se reactiva", async () => {
    const adminId = await admin();
    const b = await billing();
    const tenantId = (await b.ctx()).tenant.id;
    const resolve = () => resolveTenantContext(world.db, { userId: b.team.ownerId, tenantSlug: b.team.slug, taxpayerId: null, requestId: "prueba" });

    expect(await setTenantSuspension(world.db, adminId, { tenantId, suspended: true, reason: "Impago" })).toEqual({ ok: true });
    expect(await resolve()).toEqual({ ok: false, reason: "TENANT_SUSPENDED" });
    expect(await setTenantSuspension(world.db, adminId, { tenantId, suspended: false, reason: null })).toEqual({ ok: true });
    expect(await resolve()).toMatchObject({ ok: true });
  });

  it("se suspende y reactiva una cuenta, pero nunca la propia", async () => {
    const adminId = await admin();
    const user = await world.createUser();
    expect(await setUserSuspension(world.db, adminId, { userId: user.id, suspended: true, reason: "Abuso" })).toEqual({ ok: true });
    expect((await listPlatformUsers(world.db, adminId)).find((row) => row.id === user.id)?.suspendedReason).toBe("Abuso");
    expect(await setUserSuspension(world.db, adminId, { userId: adminId, suspended: true, reason: null })).toEqual({ ok: false, reason: "SELF" });
    expect(await setUserSuspension(world.db, adminId, { userId: user.id, suspended: false, reason: null })).toEqual({ ok: true });
  });
});

describe("modo soporte", () => {
  it("el administrador consulta una organización ajena en solo lectura, y queda auditado", async () => {
    const adminId = await admin();
    const b = await billing();
    await draft(b);
    const opened = await openSupportContext(world.db, { userId: adminId, tenantSlug: b.team.slug, taxpayerId: b.taxpayerId, requestId: "soporte" });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const { context } = opened;
    expect(context.support).toBe(true);
    expect(await listInvoices(world.db, context)).toHaveLength(1);
    // Sin permisos de escritura (y, aunque los tuviera, la base de datos rechazaría escribir).
    expect(context.permissions.has("invoices.draft")).toBe(false);
    await expect(createDraftInvoice(world.db, context, { customerId: b.customerId, lines: [] })).rejects.toBeInstanceOf(AuthorizationError);
    expect(await world.owner.auditEvent.count({ where: { action: "platform.support_access", actorUserId: adminId, tenantId: context.tenant.id } })).toBe(1);
  });

  it("quien no es administrador no puede abrirlo", async () => {
    const b = await billing();
    const normal = await world.createUser();
    expect(await openSupportContext(world.db, { userId: normal.id, tenantSlug: b.team.slug, taxpayerId: null, requestId: "soporte" })).toEqual({
      ok: false,
      reason: "TENANT_NOT_FOUND",
    });
  });
});
