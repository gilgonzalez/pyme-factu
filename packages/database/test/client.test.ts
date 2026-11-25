// El cliente de base de datos trabaja en UTC, sea cual sea la zona horaria del servidor. Si no, el adaptador de
// Prisma intercambia las fechas sin desfase: en JavaScript cuadran, pero comparadas con now() en SQL (control de
// flujo del worker, Fase 6) quedan desplazadas la diferencia horaria.
import { afterAll, describe, expect, inject, it } from "vitest";
import { createDatabaseClient } from "../src";

const db = createDatabaseClient(inject("dbUrls").owner, { maxConnections: 1 });
afterAll(async () => {
  await db.$disconnect();
});

describe("zona horaria de las sesiones", () => {
  it("cada sesión del cliente usa UTC", async () => {
    const [row] = await db.$queryRaw<{ TimeZone: string }[]>`SHOW TimeZone`;
    expect(row?.TimeZone).toBe("UTC");
  });

  it("una fecha escrita con Prisma se compara bien con now() en SQL", async () => {
    const system = await db.taxpayer.findFirstOrThrow({ select: { id: true, tenantId: true } });
    const inOneMinute = new Date(Date.now() + 60_000);
    const created = await db.billingSystem.upsert({
      where: { taxpayerId: system.id },
      create: { tenantId: system.tenantId, taxpayerId: system.id, nextSendAt: inOneMinute },
      update: { nextSendAt: inOneMinute },
    });
    const [row] = await db.$queryRaw<{ future: boolean; seconds: number }[]>`
      SELECT next_send_at > now() AS future, extract(epoch FROM next_send_at - now())::float AS seconds FROM billing_systems WHERE id = ${created.id}::uuid`;
    expect(row?.future).toBe(true);
    expect(row?.seconds).toBeGreaterThan(50);
    expect(row?.seconds).toBeLessThanOrEqual(60);
  });
});
