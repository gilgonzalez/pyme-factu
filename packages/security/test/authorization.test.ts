import { describe, expect, it } from "vitest";
import { decideMemberRemoval, decideRoleChange, effectivePermissions, PERMISSIONS, type Permission, type Role } from "../src";

const has = (role: Role, permission: Permission, access: "FULL" | "READ_ONLY" | "NONE" = "FULL"): boolean =>
  effectivePermissions(role, access).has(permission);

describe("matriz de permisos por rol", () => {
  it("OWNER tiene todos los permisos", () => {
    expect([...effectivePermissions("OWNER", "FULL")].sort()).toEqual([...PERMISSIONS].sort());
  });

  it("ADMIN administra pero no transfiere la propiedad ni desactiva la organización", () => {
    expect(has("ADMIN", "members.invite")).toBe(true);
    expect(has("ADMIN", "certificates.manage")).toBe(true);
    expect(has("ADMIN", "tenant.transfer_ownership")).toBe(false);
    expect(has("ADMIN", "tenant.deactivate")).toBe(false);
  });

  it("ACCOUNTANT factura y consulta informes, pero no gestiona equipo ni certificados", () => {
    expect(has("ACCOUNTANT", "invoices.issue")).toBe(true);
    expect(has("ACCOUNTANT", "invoices.rectify")).toBe(true);
    expect(has("ACCOUNTANT", "reports.read")).toBe(true);
    expect(has("ACCOUNTANT", "members.invite")).toBe(false);
    expect(has("ACCOUNTANT", "certificates.manage")).toBe(false);
  });

  it("EMPLOYEE prepara borradores pero no emite facturas", () => {
    expect(has("EMPLOYEE", "invoices.draft")).toBe(true);
    expect(has("EMPLOYEE", "customers.write")).toBe(true);
    expect(has("EMPLOYEE", "invoices.issue")).toBe(false);
    expect(has("EMPLOYEE", "products.write")).toBe(false);
  });

  it("VIEWER solo tiene permisos de lectura", () => {
    const viewer = [...effectivePermissions("VIEWER", "FULL")];
    expect(viewer.length).toBeGreaterThan(0);
    expect(viewer.every((permission) => permission.endsWith(".read"))).toBe(true);
  });

  it("nadie salvo OWNER y ADMIN lee la auditoría", () => {
    const readers = (["OWNER", "ADMIN", "ACCOUNTANT", "EMPLOYEE", "VIEWER"] as const).filter((role) => has(role, "audit.read"));
    expect(readers).toEqual(["OWNER", "ADMIN"]);
  });
});

describe("acceso al contribuyente activo", () => {
  it("sin acceso al contribuyente se pierden todos los permisos fiscales, no los de organización", () => {
    expect(has("ACCOUNTANT", "invoices.read", "NONE")).toBe(false);
    expect(has("ACCOUNTANT", "customers.read", "NONE")).toBe(false);
    expect(has("ACCOUNTANT", "tenant.read", "NONE")).toBe(true);
    expect(has("ACCOUNTANT", "taxpayers.read", "NONE")).toBe(true);
  });

  it("con acceso de solo lectura se conservan las lecturas fiscales y se pierden las escrituras", () => {
    expect(has("ACCOUNTANT", "invoices.read", "READ_ONLY")).toBe(true);
    expect(has("ACCOUNTANT", "invoices.issue", "READ_ONLY")).toBe(false);
    expect(has("ACCOUNTANT", "customers.write", "READ_ONLY")).toBe(false);
  });

  it("el acceso al contribuyente nunca añade permisos que el rol no tiene", () => {
    expect(has("VIEWER", "invoices.issue", "FULL")).toBe(false);
  });
});

describe("cambios de rol (anti-escalada)", () => {
  const admin = { actorUserId: "u-admin", actorRole: "ADMIN" as const };
  const owner = { actorUserId: "u-owner", actorRole: "OWNER" as const };

  it("un usuario no puede cambiar su propio rol", () => {
    expect(decideRoleChange({ ...admin, targetUserId: "u-admin", targetCurrentRole: "ADMIN", newRole: "VIEWER" })).toEqual({
      allowed: false,
      reason: "SELF_CHANGE",
    });
  });

  it("OWNER nunca se asigna: solo se transfiere", () => {
    expect(decideRoleChange({ ...owner, targetUserId: "u-x", targetCurrentRole: "ADMIN", newRole: "OWNER" })).toEqual({
      allowed: false,
      reason: "OWNER_VIA_TRANSFER_ONLY",
    });
  });

  it("ADMIN no puede nombrar a otro ADMIN ni tocar a un igual", () => {
    expect(decideRoleChange({ ...admin, targetUserId: "u-x", targetCurrentRole: "VIEWER", newRole: "ADMIN" })).toEqual({
      allowed: false,
      reason: "INSUFFICIENT_RANK",
    });
    expect(decideRoleChange({ ...admin, targetUserId: "u-x", targetCurrentRole: "ADMIN", newRole: "VIEWER" })).toEqual({
      allowed: false,
      reason: "INSUFFICIENT_RANK",
    });
  });

  it("ADMIN puede cambiar roles inferiores entre sí", () => {
    expect(decideRoleChange({ ...admin, targetUserId: "u-x", targetCurrentRole: "VIEWER", newRole: "ACCOUNTANT" })).toEqual({
      allowed: true,
    });
  });

  it("OWNER puede nombrar ADMIN", () => {
    expect(decideRoleChange({ ...owner, targetUserId: "u-x", targetCurrentRole: "EMPLOYEE", newRole: "ADMIN" })).toEqual({
      allowed: true,
    });
  });

  it("invitar (sin rol previo) sigue las mismas reglas de rango", () => {
    expect(decideRoleChange({ ...admin, targetUserId: null, targetCurrentRole: null, newRole: "EMPLOYEE" })).toEqual({ allowed: true });
    expect(decideRoleChange({ ...admin, targetUserId: null, targetCurrentRole: null, newRole: "ADMIN" })).toEqual({
      allowed: false,
      reason: "INSUFFICIENT_RANK",
    });
  });

  it("un rol sin permiso de gestión de miembros no puede cambiar roles", () => {
    expect(
      decideRoleChange({ actorUserId: "u-acc", actorRole: "ACCOUNTANT", targetUserId: "u-x", targetCurrentRole: "VIEWER", newRole: "EMPLOYEE" }),
    ).toEqual({ allowed: false, reason: "MISSING_PERMISSION" });
  });
});

describe("decideMemberRemoval", () => {
  const remove = (actorRole: Role, targetRole: Role, targetUserId = "u-target") =>
    decideMemberRemoval({ actorUserId: "u-actor", actorRole, targetUserId, targetRole });

  it("permite quitar a miembros de rango estrictamente inferior", () => {
    expect(remove("OWNER", "ADMIN")).toEqual({ allowed: true });
    expect(remove("ADMIN", "ACCOUNTANT")).toEqual({ allowed: true });
  });

  it("nadie quita a alguien de rango igual o superior (el OWNER nunca se quita)", () => {
    expect(remove("ADMIN", "ADMIN")).toEqual({ allowed: false, reason: "INSUFFICIENT_RANK" });
    expect(remove("ADMIN", "OWNER")).toEqual({ allowed: false, reason: "INSUFFICIENT_RANK" });
  });

  it("nadie se quita a sí mismo desde la gestión de equipo", () => {
    expect(remove("OWNER", "OWNER", "u-actor")).toEqual({ allowed: false, reason: "SELF_CHANGE" });
  });

  it("exige el permiso members.remove", () => {
    expect(remove("ACCOUNTANT", "VIEWER")).toEqual({ allowed: false, reason: "MISSING_PERMISSION" });
  });
});
