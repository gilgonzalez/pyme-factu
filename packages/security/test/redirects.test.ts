import { describe, expect, it } from "vitest";
import { safeReturnPath } from "../src";

describe("safeReturnPath (redirecciones abiertas)", () => {
  it.each([
    ["/organizaciones", "/organizaciones"],
    ["/invitacion/abc_DEF-123", "/invitacion/abc_DEF-123"],
    ["/empresa-alfa/equipo?pestaña=invitaciones", "/empresa-alfa/equipo?pestaña=invitaciones"],
  ])("acepta la ruta interna %s", (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected);
  });

  it.each([
    ["https://atacante.example/"],
    ["//atacante.example"],
    ["/\\atacante.example"],
    ["\\\\atacante.example"],
    ["javascript:alert(1)"],
    ["organizaciones"],
    ["/ruta\ncon-salto"],
    [""],
    [null],
    [42],
  ])("rechaza %j y devuelve el destino por defecto", (input) => {
    expect(safeReturnPath(input)).toBe("/organizaciones");
  });

  it("permite elegir el destino por defecto", () => {
    expect(safeReturnPath(undefined, "/entrar")).toBe("/entrar");
  });
});
