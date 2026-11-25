// Datos personales de la propia cuenta (RGPD arts. 15 y 20) y desactivación de la cuenta (Fase 7). PostgreSQL real
// con el rol facturalibre_app; datos ficticios.
import { describe, expect, it } from "vitest";
import { deactivateMyAccount, exportMyData } from "../src";
import { testWorld } from "./support";

const world = testWorld();

describe("mis datos personales", () => {
  it("incluye la cuenta, sus organizaciones con su rol y su actividad, y nada de otras personas", async () => {
    const team = await world.newTeam();
    const member = await team.add("ACCOUNTANT");
    const data = await exportMyData(world.db, team.ownerId);
    expect(data).toMatchObject({ usuario: { id: team.ownerId, email_verificado: true, desactivado: null } });
    expect(data?.organizaciones).toEqual([expect.objectContaining({ direccion: team.slug, rol: "OWNER", estado: "ACTIVE" })]);
    expect(data?.actividad.map((event) => event.accion)).toContain("invitation.created");
    expect(JSON.stringify(data)).not.toContain(member.id);
  });
});

describe("desactivar la cuenta", () => {
  it("no se puede dejar una organización activa sin propietario", async () => {
    const team = await world.newTeam();
    expect(await deactivateMyAccount(world.db, team.ownerId)).toEqual({ ok: false, reason: "SOLE_OWNER" });
    expect((await world.owner.user.findUniqueOrThrow({ where: { id: team.ownerId } })).deactivatedAt).toBeNull();
  });

  it("deja sin acceso (membresías suspendidas, sesiones cerradas) y conserva la autoría en la auditoría", async () => {
    const team = await world.newTeam();
    const member = await team.add("ADMIN");
    await world.owner.session.create({ data: { userId: member.id, token: `t-${member.id}`, expiresAt: new Date(Date.now() + 3_600_000) } });

    expect(await deactivateMyAccount(world.db, member.id)).toEqual({ ok: true });
    expect((await world.owner.user.findUniqueOrThrow({ where: { id: member.id } })).deactivatedAt).toBeInstanceOf(Date);
    expect(await world.owner.session.count({ where: { userId: member.id } })).toBe(0);
    expect(await world.owner.tenantMembership.findMany({ where: { userId: member.id }, select: { status: true } })).toEqual([{ status: "SUSPENDED" }]);
    expect(await world.owner.auditEvent.count({ where: { actorUserId: member.id, action: "user.deactivated" } })).toBe(1);
    // Ya no puede entrar en la organización.
    await expect(world.contextFor(member.id, team.slug)).rejects.toThrow(/contexto no resuelto/);
    // Sus datos siguen pudiéndose exportar (los conserva) y reflejan la desactivación.
    expect(await exportMyData(world.db, member.id)).toMatchObject({ usuario: { desactivado: expect.any(String) as unknown } });
  });
});
