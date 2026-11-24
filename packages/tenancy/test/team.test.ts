// Casos de uso de organización, invitaciones y miembros contra PostgreSQL real (rol facturalibre_app).
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  acceptInvitation,
  AuthorizationError,
  changeMemberRole,
  createOrganization,
  inviteMember,
  listInvitations,
  listMembers,
  listMyOrganizations,
  previewInvitation,
  removeMember,
  revokeInvitation,
  transferOwnership,
} from "../src";
import { testWorld, unique } from "./support";

const world = testWorld();
const { createUser, contextFor, newTeam } = world;

describe("organizaciones", () => {
  it("quien crea la organización es su OWNER y la ve en su lista", async () => {
    const user = await createUser();
    const slug = `org-${unique()}`;
    expect(await createOrganization(world.db, user.id, { name: "Fontanería Ficticia", slug })).toEqual({ ok: true, slug });
    expect(await listMyOrganizations(world.db, user.id)).toEqual([{ slug, name: "Fontanería Ficticia", role: "OWNER" }]);
  });

  it("informa de un slug ocupado, de datos inválidos y de un email sin verificar", async () => {
    const user = await createUser();
    const slug = `org-${unique()}`;
    await createOrganization(world.db, user.id, { name: "Primera", slug });
    expect(await createOrganization(world.db, user.id, { name: "Segunda", slug })).toEqual({ ok: false, reason: "SLUG_TAKEN" });
    expect(await createOrganization(world.db, user.id, { name: "", slug })).toMatchObject({ ok: false, reason: "INVALID" });
    const unverified = await createUser({ verified: false });
    expect(await createOrganization(world.db, unverified.id, { name: "X", slug: `org-${unique()}` })).toEqual({
      ok: false,
      reason: "EMAIL_NOT_VERIFIED",
    });
  });

  it("la lista no muestra organizaciones ajenas", async () => {
    await newTeam();
    const loner = await createUser();
    expect(await listMyOrganizations(world.db, loner.id)).toEqual([]);
  });
});

describe("invitaciones", () => {
  it("invitar → vista previa → aceptar da acceso con el rol invitado", async () => {
    const team = await newTeam();
    const invitee = await createUser();
    const invited = await inviteMember(world.db, await team.ownerCtx(), { email: invitee.email.toUpperCase(), role: "ACCOUNTANT" });
    expect(invited).toMatchObject({ ok: true, invitation: { email: invitee.email, role: "ACCOUNTANT" } });
    if (!invited.ok) return;

    const founderName = (await world.owner.user.findUniqueOrThrow({ where: { id: team.ownerId } })).name;
    const pending = await listInvitations(world.db, await team.ownerCtx());
    expect(pending.map(({ email, role, invitedByName }) => ({ email, role, invitedByName }))).toEqual([
      { email: invitee.email, role: "ACCOUNTANT", invitedByName: founderName },
    ]);
    expect(await previewInvitation(world.db, invitee.id, invited.token)).toEqual({
      tenantName: "Organización ficticia",
      email: invitee.email,
      role: "ACCOUNTANT",
      status: "PENDING",
    });
    expect(await acceptInvitation(world.db, invitee.id, invited.token)).toEqual({ status: "ACCEPTED", tenantSlug: team.slug });
    expect((await contextFor(invitee.id, team.slug)).membership.role).toBe("ACCOUNTANT");
    expect(await listInvitations(world.db, await team.ownerCtx())).toEqual([]);
  });

  it("el token no se guarda en claro", async () => {
    const team = await newTeam();
    const invited = await inviteMember(world.db, await team.ownerCtx(), { email: `x-${unique()}@example.test`, role: "VIEWER" });
    if (!invited.ok) throw new Error(invited.reason);
    expect(invited.token.length).toBeGreaterThanOrEqual(43);
    expect(await world.owner.tenantInvitation.count({ where: { tokenHash: invited.token } })).toBe(0);
  });

  it("reinvitar al mismo email sustituye la invitación anterior", async () => {
    const team = await newTeam();
    const invitee = await createUser();
    const first = await inviteMember(world.db, await team.ownerCtx(), { email: invitee.email, role: "VIEWER" });
    const second = await inviteMember(world.db, await team.ownerCtx(), { email: invitee.email, role: "EMPLOYEE" });
    if (!first.ok || !second.ok) throw new Error("invitación fallida");
    expect(await acceptInvitation(world.db, invitee.id, first.token)).toEqual({ status: "REVOKED", tenantSlug: null });
    expect(await acceptInvitation(world.db, invitee.id, second.token)).toEqual({ status: "ACCEPTED", tenantSlug: team.slug });
    expect((await contextFor(invitee.id, team.slug)).membership.role).toBe("EMPLOYEE");
  });

  it("una invitación revocada ya no se puede aceptar", async () => {
    const team = await newTeam();
    const invitee = await createUser();
    const invited = await inviteMember(world.db, await team.ownerCtx(), { email: invitee.email, role: "VIEWER" });
    if (!invited.ok) throw new Error(invited.reason);
    expect(await revokeInvitation(world.db, await team.ownerCtx(), invited.invitation.id)).toEqual({ ok: true });
    expect(await acceptInvitation(world.db, invitee.id, invited.token)).toEqual({ status: "REVOKED", tenantSlug: null });
    expect(await revokeInvitation(world.db, await team.ownerCtx(), invited.invitation.id)).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("no invita a quien ya es miembro", async () => {
    const team = await newTeam();
    const member = await team.add("VIEWER");
    const email = (await world.owner.user.findUniqueOrThrow({ where: { id: member.id } })).email;
    expect(await inviteMember(world.db, await team.ownerCtx(), { email, role: "EMPLOYEE" })).toEqual({ ok: false, reason: "ALREADY_MEMBER" });
  });

  it("anti-escalada: un ADMIN no invita a otro ADMIN y un EMPLOYEE no invita", async () => {
    const team = await newTeam();
    const admin = await team.add("ADMIN");
    expect(await inviteMember(world.db, await admin.ctx(), { email: `y-${unique()}@example.test`, role: "ADMIN" })).toEqual({
      ok: false,
      reason: "INSUFFICIENT_RANK",
    });
    const employee = await team.add("EMPLOYEE");
    await expect(inviteMember(world.db, await employee.ctx(), { email: `z-${unique()}@example.test`, role: "VIEWER" })).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it("audita la creación de la invitación sin guardar el token", async () => {
    const team = await newTeam();
    const invited = await inviteMember(world.db, await team.ownerCtx(), { email: `w-${unique()}@example.test`, role: "VIEWER" });
    if (!invited.ok) throw new Error(invited.reason);
    const events = await world.owner.auditEvent.findMany({ where: { action: "invitation.created", entityId: invited.invitation.id } });
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0]?.metadata)).not.toContain(invited.token);
  });
});

describe("miembros", () => {
  it("lista los miembros con nombre, email y rol", async () => {
    const team = await newTeam();
    const accountant = await team.add("ACCOUNTANT");
    const users = await world.owner.user.findMany({ where: { id: { in: [team.ownerId, accountant.id] } } });
    const expected = (id: string, role: string) => {
      const user = users.find((candidate) => candidate.id === id);
      return { userId: id, name: user?.name, email: user?.email, role, status: "ACTIVE" };
    };
    const members = await listMembers(world.db, await team.ownerCtx());
    expect(members.map(({ userId, name, email, role, status }) => ({ userId, name, email, role, status }))).toEqual([
      expected(team.ownerId, "OWNER"),
      expected(accountant.id, "ACCOUNTANT"),
    ]);
  });

  it("el OWNER cambia el rol de un miembro y queda auditado", async () => {
    const team = await newTeam();
    const member = await team.add("ACCOUNTANT");
    expect(await changeMemberRole(world.db, await team.ownerCtx(), member.membershipId, "VIEWER")).toEqual({ ok: true });
    expect((await member.ctx()).membership.role).toBe("VIEWER");
    expect(await world.owner.auditEvent.count({ where: { action: "member.role_changed", entityId: member.membershipId } })).toBe(1);
  });

  it("nadie cambia su propio rol ni el de alguien de rango igual o superior", async () => {
    const team = await newTeam();
    const admin = await team.add("ADMIN");
    const otherAdmin = await team.add("ADMIN");
    const adminCtx = await admin.ctx();
    expect(await changeMemberRole(world.db, adminCtx, admin.membershipId, "VIEWER")).toEqual({ ok: false, reason: "SELF_CHANGE" });
    expect(await changeMemberRole(world.db, adminCtx, otherAdmin.membershipId, "VIEWER")).toEqual({ ok: false, reason: "INSUFFICIENT_RANK" });
    const ownerMembership = (await team.ownerCtx()).membership.id;
    expect(await changeMemberRole(world.db, adminCtx, ownerMembership, "VIEWER")).toEqual({ ok: false, reason: "INSUFFICIENT_RANK" });
    expect(await changeMemberRole(world.db, adminCtx, randomUUID(), "VIEWER")).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("quitar a un miembro le retira el acceso inmediatamente", async () => {
    const team = await newTeam();
    const member = await team.add("EMPLOYEE");
    expect(await removeMember(world.db, await team.ownerCtx(), member.membershipId)).toEqual({ ok: true });
    await expect(member.ctx()).rejects.toThrow(/TENANT_NOT_FOUND/);
    expect(await world.owner.auditEvent.count({ where: { action: "member.removed", entityId: member.membershipId } })).toBe(1);
  });

  it("no se puede quitar al OWNER ni quitarse a uno mismo", async () => {
    const team = await newTeam();
    const admin = await team.add("ADMIN");
    const ownerCtx = await team.ownerCtx();
    expect(await removeMember(world.db, await admin.ctx(), ownerCtx.membership.id)).toEqual({ ok: false, reason: "INSUFFICIENT_RANK" });
    expect(await removeMember(world.db, ownerCtx, ownerCtx.membership.id)).toEqual({ ok: false, reason: "SELF_CHANGE" });
  });
});

describe("transferencia de propiedad", () => {
  it("el OWNER pasa a ADMIN y el destinatario a OWNER, en una transacción auditada", async () => {
    const team = await newTeam();
    const heir = await team.add("ACCOUNTANT");
    expect(await transferOwnership(world.db, await team.ownerCtx(), heir.membershipId, { sessionIsFresh: true })).toEqual({ ok: true });
    expect((await heir.ctx()).membership).toMatchObject({ role: "OWNER", taxpayerScope: "ALL_TAXPAYERS" });
    expect((await team.ownerCtx()).membership.role).toBe("ADMIN");
    expect(await world.owner.auditEvent.count({ where: { action: "tenant.ownership_transferred", entityId: heir.membershipId } })).toBe(1);
  });

  it("exige reautenticación reciente y un destinatario miembro distinto de uno mismo", async () => {
    const team = await newTeam();
    const heir = await team.add("VIEWER");
    const ownerCtx = await team.ownerCtx();
    expect(await transferOwnership(world.db, ownerCtx, heir.membershipId, { sessionIsFresh: false })).toEqual({ ok: false, reason: "STALE_SESSION" });
    expect(await transferOwnership(world.db, ownerCtx, ownerCtx.membership.id, { sessionIsFresh: true })).toEqual({ ok: false, reason: "SELF_CHANGE" });
    expect(await transferOwnership(world.db, ownerCtx, randomUUID(), { sessionIsFresh: true })).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("solo el OWNER puede transferir", async () => {
    const team = await newTeam();
    const admin = await team.add("ADMIN");
    const heir = await team.add("VIEWER");
    await expect(transferOwnership(world.db, await admin.ctx(), heir.membershipId, { sessionIsFresh: true })).rejects.toBeInstanceOf(AuthorizationError);
  });
});
