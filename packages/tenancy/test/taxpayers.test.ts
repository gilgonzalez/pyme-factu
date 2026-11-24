// Contribuyentes (obligados tributarios emisores) y su acceso por miembro, contra PostgreSQL real.
// NIF ficticios calculados con los algoritmos oficiales.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AuthorizationError, createTaxpayer, getTaxpayer, listTaxpayerAccess, listTaxpayers, setTaxpayerAccess, updateTaxpayer, type TenantContext } from "../src";
import { testWorld } from "./support";

const world = testWorld();

const COMPANY = { nif: "b-1234567-4", legalName: "Fontanería Ficticia SL", postalCode: "28001", city: "Madrid", province: "Madrid" };

async function created(ctx: TenantContext, raw: Record<string, unknown> = COMPANY): Promise<string> {
  const result = await createTaxpayer(world.db, ctx, raw);
  if (!result.ok) throw new Error(`alta de contribuyente fallida: ${result.reason}`);
  return result.taxpayer.id;
}

describe("alta de contribuyentes", () => {
  it("normaliza el NIF, deduce el tipo de persona, da acceso completo al OWNER y lo audita", async () => {
    const team = await world.newTeam();
    const ctx = await team.ownerCtx();
    const result = await createTaxpayer(world.db, ctx, COMPANY);
    expect(result).toMatchObject({ ok: true, taxpayer: { nif: "B12345674", legalName: "Fontanería Ficticia SL", personType: "LEGAL_ENTITY" } });
    if (!result.ok) return;

    expect(await listTaxpayers(world.db, ctx)).toEqual([
      { id: result.taxpayer.id, nif: "B12345674", legalName: "Fontanería Ficticia SL", tradeName: null, personType: "LEGAL_ENTITY", status: "ACTIVE", access: "FULL" },
    ]);
    expect(await world.owner.taxpayerSettings.count({ where: { taxpayerId: result.taxpayer.id } })).toBe(1);
    expect(await world.owner.auditEvent.count({ where: { action: "taxpayer.created", entityId: result.taxpayer.id } })).toBe(1);
  });

  it("un DNI da de alta a una persona física", async () => {
    const team = await world.newTeam();
    const result = await createTaxpayer(world.db, await team.ownerCtx(), { nif: "12345678z", legalName: "Ana Ficticia Pérez" });
    expect(result).toMatchObject({ ok: true, taxpayer: { nif: "12345678Z", personType: "NATURAL_PERSON" } });
  });

  it("explica por campo los datos inválidos", async () => {
    const team = await world.newTeam();
    const result = await createTaxpayer(world.db, await team.ownerCtx(), {
      nif: "B12345675",
      legalName: "",
      postalCode: "99999",
      email: "no-es-email",
    });
    expect(result).toEqual({
      ok: false,
      reason: "INVALID",
      errors: {
        nif: "El NIF no es válido: revisa el último carácter (control).",
        legalName: "Escribe el nombre y apellidos o la razón social.",
        postalCode: "Escribe un código postal español de 5 cifras.",
        email: "Escribe un email válido.",
      },
    });
  });

  it("no repite un NIF dentro de la organización, pero otra organización sí puede usarlo", async () => {
    const team = await world.newTeam();
    await created(await team.ownerCtx());
    expect(await createTaxpayer(world.db, await team.ownerCtx(), COMPANY)).toEqual({ ok: false, reason: "NIF_TAKEN" });
    const other = await world.newTeam();
    expect(await createTaxpayer(world.db, await other.ownerCtx(), COMPANY)).toMatchObject({ ok: true });
  });

  it("solo OWNER y ADMIN dan de alta contribuyentes", async () => {
    const team = await world.newTeam();
    const accountant = await team.add("ACCOUNTANT");
    await expect(createTaxpayer(world.db, await accountant.ctx(), COMPANY)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("un ADMIN con alcance de contribuyentes asignados obtiene acceso completo al que crea", async () => {
    const team = await world.newTeam();
    const admin = await team.add("ADMIN", "ASSIGNED_TAXPAYERS");
    const id = await created(await admin.ctx());
    expect((await listTaxpayers(world.db, await admin.ctx())).map((taxpayer) => [taxpayer.id, taxpayer.access])).toEqual([[id, "FULL"]]);
  });
});

describe("acceso por contribuyente", () => {
  it("un miembro con alcance asignado no ve nada hasta que se le da acceso, y el acceso limita sus permisos", async () => {
    const team = await world.newTeam();
    const id = await created(await team.ownerCtx());
    const employee = await team.add("EMPLOYEE", "ASSIGNED_TAXPAYERS");
    expect(await listTaxpayers(world.db, await employee.ctx())).toEqual([]);

    const grant = { taxpayerId: id, membershipId: employee.membershipId };
    expect(await setTaxpayerAccess(world.db, await team.ownerCtx(), { ...grant, access: "READ_ONLY" })).toEqual({ ok: true });
    expect((await listTaxpayers(world.db, await employee.ctx())).map((taxpayer) => taxpayer.access)).toEqual(["READ_ONLY"]);
    const readOnly = await employee.ctx(id);
    expect(readOnly.permissions.has("invoices.read")).toBe(true);
    expect(readOnly.permissions.has("invoices.draft")).toBe(false);

    expect(await setTaxpayerAccess(world.db, await team.ownerCtx(), { ...grant, access: "FULL" })).toEqual({ ok: true });
    expect((await employee.ctx(id)).permissions.has("invoices.draft")).toBe(true);

    expect(await setTaxpayerAccess(world.db, await team.ownerCtx(), { ...grant, access: "NONE" })).toEqual({ ok: true });
    expect(await listTaxpayers(world.db, await employee.ctx())).toEqual([]);
    expect(await world.owner.auditEvent.count({ where: { action: "taxpayer.access_changed", entityId: id } })).toBe(3);
  });

  it("lista quién accede a un contribuyente y con qué nivel", async () => {
    const team = await world.newTeam();
    const id = await created(await team.ownerCtx());
    const employee = await team.add("EMPLOYEE", "ASSIGNED_TAXPAYERS");
    const viewer = await team.add("VIEWER", "ASSIGNED_TAXPAYERS");
    await setTaxpayerAccess(world.db, await team.ownerCtx(), { taxpayerId: id, membershipId: viewer.membershipId, access: "READ_ONLY" });

    const access = await listTaxpayerAccess(world.db, await team.ownerCtx(), id);
    expect(access.map(({ membershipId, role, scope, access: level }) => ({ membershipId, role, scope, access: level }))).toEqual([
      { membershipId: (await team.ownerCtx()).membership.id, role: "OWNER", scope: "ALL_TAXPAYERS", access: "FULL" },
      { membershipId: employee.membershipId, role: "EMPLOYEE", scope: "ASSIGNED_TAXPAYERS", access: "NONE" },
      { membershipId: viewer.membershipId, role: "VIEWER", scope: "ASSIGNED_TAXPAYERS", access: "READ_ONLY" },
    ]);
  });

  it("no se asigna acceso a uno mismo, a quien ya ve todos, ni a un contribuyente que no se ve", async () => {
    const team = await world.newTeam();
    const id = await created(await team.ownerCtx());
    const allScope = await team.add("ACCOUNTANT", "ALL_TAXPAYERS");
    const assignedAdmin = await team.add("ADMIN", "ASSIGNED_TAXPAYERS");
    const employee = await team.add("EMPLOYEE", "ASSIGNED_TAXPAYERS");
    const ownerCtx = await team.ownerCtx();

    expect(await setTaxpayerAccess(world.db, ownerCtx, { taxpayerId: id, membershipId: allScope.membershipId, access: "READ_ONLY" })).toEqual({
      ok: false,
      reason: "ALL_TAXPAYERS_SCOPE",
    });
    const adminCtx = await assignedAdmin.ctx();
    // El ADMIN no tiene acceso a ese contribuyente: ni para sí ni para otros (no se revela que existe).
    expect(await setTaxpayerAccess(world.db, adminCtx, { taxpayerId: id, membershipId: assignedAdmin.membershipId, access: "FULL" })).toEqual({
      ok: false,
      reason: "SELF_CHANGE",
    });
    expect(await setTaxpayerAccess(world.db, adminCtx, { taxpayerId: id, membershipId: employee.membershipId, access: "FULL" })).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
    expect(await setTaxpayerAccess(world.db, ownerCtx, { taxpayerId: randomUUID(), membershipId: employee.membershipId, access: "FULL" })).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
    // Identificadores mal formados (llegan del navegador) y contribuyente invisible: sin datos.
    for (const input of [
      { taxpayerId: "no-es-uuid", membershipId: employee.membershipId },
      { taxpayerId: id, membershipId: "no-es-uuid" },
    ]) {
      expect(await setTaxpayerAccess(world.db, ownerCtx, { ...input, access: "FULL" })).toEqual({ ok: false, reason: "NOT_FOUND" });
    }
    expect(await listTaxpayerAccess(world.db, adminCtx, id)).toEqual([]);
  });

  it("solo quien tiene taxpayers.manage_access gestiona accesos", async () => {
    const team = await world.newTeam();
    const id = await created(await team.ownerCtx());
    const accountant = await team.add("ACCOUNTANT");
    const employee = await team.add("EMPLOYEE", "ASSIGNED_TAXPAYERS");
    await expect(
      setTaxpayerAccess(world.db, await accountant.ctx(), { taxpayerId: id, membershipId: employee.membershipId, access: "FULL" }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("edición de contribuyentes", () => {
  it("actualiza los datos pero nunca el NIF ni el tipo de persona", async () => {
    const team = await world.newTeam();
    const id = await created(await team.ownerCtx());
    const result = await updateTaxpayer(world.db, await team.ownerCtx(id), {
      nif: "12345678Z",
      legalName: "Fontanería Ficticia Renovada SL",
      tradeName: "Fontanería Rápida",
      postalCode: "08001",
      city: "Barcelona",
    });
    expect(result).toEqual({ ok: true });
    const stored = await world.owner.taxpayer.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({
      nif: "B12345674",
      personType: "LEGAL_ENTITY",
      legalName: "Fontanería Ficticia Renovada SL",
      tradeName: "Fontanería Rápida",
      postalCode: "08001",
      city: "Barcelona",
      province: null,
    });
    expect(await world.owner.auditEvent.count({ where: { action: "taxpayer.updated", entityId: id } })).toBe(1);
  });

  it("valida los datos editados y exige acceso completo al contribuyente", async () => {
    const team = await world.newTeam();
    const id = await created(await team.ownerCtx());
    expect(await updateTaxpayer(world.db, await team.ownerCtx(id), { legalName: "" })).toEqual({
      ok: false,
      reason: "INVALID",
      errors: { legalName: "Escribe el nombre y apellidos o la razón social." },
    });
    const admin = await team.add("ADMIN", "ASSIGNED_TAXPAYERS");
    await setTaxpayerAccess(world.db, await team.ownerCtx(), { taxpayerId: id, membershipId: admin.membershipId, access: "READ_ONLY" });
    await expect(updateTaxpayer(world.db, await admin.ctx(id), { legalName: "Otro nombre" })).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("ficha del contribuyente activo", () => {
  it("devuelve todos sus datos y el nivel de acceso de quien la consulta", async () => {
    const team = await world.newTeam();
    const id = await created(await team.ownerCtx(), { ...COMPANY, tradeName: "Fontanería Rápida", email: "Hola@Example.TEST" });
    expect(await getTaxpayer(world.db, await team.ownerCtx(id))).toEqual({
      id,
      nif: "B12345674",
      personType: "LEGAL_ENTITY",
      legalName: "Fontanería Ficticia SL",
      tradeName: "Fontanería Rápida",
      addressLine: null,
      postalCode: "28001",
      city: "Madrid",
      province: "Madrid",
      email: "hola@example.test",
      status: "ACTIVE",
      access: "FULL",
    });
  });

  it("sin contribuyente activo en el contexto no hay ficha", async () => {
    const team = await world.newTeam();
    await expect(getTaxpayer(world.db, await team.ownerCtx())).rejects.toBeInstanceOf(AuthorizationError);
  });
});
