// Pruebas BLOQUEANTES: TenantContext + autorización + RLS a través de Prisma contra PostgreSQL real.
import { createDatabaseClient, type Database } from "@facturalibre/database";
import { FIXTURE } from "@facturalibre/database/testing";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { AuthorizationError, resolveTenantContext, runInTenant, type TenantContext } from "../src";

const { users, tenants, taxpayers } = FIXTURE;
let db: Database;

beforeAll(() => {
  // Pool de UNA conexión: fuerza la reutilización de la misma conexión física entre transacciones.
  db = createDatabaseClient(inject("dbUrls").app, { maxConnections: 1 });
});
afterAll(async () => {
  await db.$disconnect();
});

async function contextFor(userId: string, tenantSlug: string, taxpayerId: string | null = null): Promise<TenantContext> {
  const result = await resolveTenantContext(db, { userId, tenantSlug, taxpayerId, requestId: "test" });
  if (!result.ok) throw new Error(`contexto no resuelto: ${result.reason}`);
  return result.context;
}

describe("resolveTenantContext", () => {
  it("resuelve la membresía, el rol y los permisos del usuario en su tenant", async () => {
    const context = await contextFor(users.ana, tenants.a.slug);
    expect(context.tenant).toMatchObject({ id: tenants.a.id, slug: tenants.a.slug });
    expect(context.membership.role).toBe("OWNER");
    expect(context.taxpayer).toBeNull();
    expect(context.permissions.has("members.invite")).toBe(true);
    // Sin contribuyente activo no hay permisos fiscales.
    expect(context.permissions.has("invoices.read")).toBe(false);
  });

  it("con contribuyente activo accesible concede los permisos fiscales del rol", async () => {
    const context = await contextFor(users.ana, tenants.a.slug, taxpayers.a1);
    expect(context.taxpayer).toEqual({ id: taxpayers.a1, access: "FULL" });
    expect(context.permissions.has("invoices.issue")).toBe(true);
  });

  it.each([
    ["un tenant ajeno existente", users.ana, tenants.b.slug],
    ["un tenant inexistente", users.ana, "no-existe"],
    ["un slug mal formado", users.ana, "../../etc"],
    ["una membresía suspendida", users.dani, tenants.a.slug],
  ])("no distingue %s: responde TENANT_NOT_FOUND", async (_, userId, slug) => {
    const result = await resolveTenantContext(db, { userId, tenantSlug: slug, taxpayerId: null, requestId: "test" });
    expect(result).toEqual({ ok: false, reason: "TENANT_NOT_FOUND" });
  });

  it.each([
    ["de otro tenant", users.ana, taxpayers.b1],
    ["no asignado al miembro", users.carl, taxpayers.a2],
    ["con identificador mal formado", users.ana, "1 OR 1=1"],
  ])("rechaza un contribuyente %s", async (_, userId, taxpayerId) => {
    const result = await resolveTenantContext(db, { userId, tenantSlug: tenants.a.slug, taxpayerId, requestId: "test" });
    expect(result).toEqual({ ok: false, reason: "TAXPAYER_NOT_FOUND" });
  });

  it("aplica el nivel de acceso del contribuyente asignado (solo lectura)", async () => {
    const context = await contextFor(users.carl, tenants.a.slug, taxpayers.a1);
    expect(context.membership.role).toBe("EMPLOYEE");
    expect(context.taxpayer).toEqual({ id: taxpayers.a1, access: "READ_ONLY" });
    expect(context.permissions.has("invoices.read")).toBe(true);
    expect(context.permissions.has("customers.write")).toBe(false);
  });
});

describe("runInTenant", () => {
  it("ejecuta con el contexto de seguridad del tenant activo", async () => {
    const context = await contextFor(users.ana, tenants.a.slug);
    const rows = await runInTenant(db, context, "taxpayers.read", (tx) => tx.taxpayer.findMany({ select: { id: true } }));
    expect(rows.map((row) => row.id).sort()).toEqual([taxpayers.a1, taxpayers.a2].sort());
  });

  it("deniega sin ejecutar nada cuando falta el permiso", async () => {
    const context = await contextFor(users.carl, tenants.a.slug, taxpayers.a1);
    const work = vi.fn(() => Promise.resolve("no debería ejecutarse"));
    await expect(runInTenant(db, context, "customers.write", work)).rejects.toBeInstanceOf(AuthorizationError);
    expect(work).not.toHaveBeenCalled();
  });

  it("aunque se fabrique un contexto con el tenant de otro, PostgreSQL no devuelve sus datos", async () => {
    const genuine = await contextFor(users.ana, tenants.a.slug);
    // Simula un fallo de la aplicación: un contexto construido a mano con el tenant B.
    const forged = { ...genuine, tenant: { ...genuine.tenant, id: tenants.b.id } } as TenantContext;
    const rows = await runInTenant(db, forged, "taxpayers.read", (tx) => tx.taxpayer.findMany({ where: { id: taxpayers.b1 } }));
    expect(rows).toEqual([]);
  });

  it("la conexión reutilizada del pool no conserva el contexto anterior", async () => {
    const context = await contextFor(users.ana, tenants.a.slug);
    await runInTenant(db, context, "taxpayers.read", (tx) => tx.taxpayer.count());
    // Consulta fuera de runInTenant en la MISMA conexión (pool de tamaño 1).
    const leaked = await db.taxpayer.count();
    expect(leaked).toBe(0);
  });
});
