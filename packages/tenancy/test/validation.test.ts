import { describe, expect, it } from "vitest";
import { parseInvitationInput, parseInvoiceSendInput, parseOrganizationInput, suggestSlug } from "../src";

describe("suggestSlug", () => {
  it.each([
    ["Fontanería Pérez S.L.", "fontaneria-perez-s-l"],
    ["  Gestoría   Núñez & Asociados  ", "gestoria-nunez-asociados"],
    ["ÀÉÎÕÜ ç ñ", "aeiou-c-n"],
    ["A", "a-org"],
    ["!!!", "mi-organizacion"],
  ])("%s → %s", (name, slug) => {
    expect(suggestSlug(name)).toBe(slug);
  });

  it("no supera 63 caracteres ni termina en guion", () => {
    const slug = suggestSlug(`${"palabra ".repeat(20)}final`);
    expect(slug.length).toBeLessThanOrEqual(63);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("parseOrganizationInput", () => {
  it("acepta un nombre y un slug válidos (recortando espacios)", () => {
    expect(parseOrganizationInput({ name: "  Mi Empresa  ", slug: " mi-empresa " })).toEqual({
      ok: true,
      value: { name: "Mi Empresa", slug: "mi-empresa" },
    });
  });

  it("explica cada error en español, por campo", () => {
    expect(parseOrganizationInput({ name: "", slug: "-mal-" })).toEqual({
      ok: false,
      errors: {
        name: "Escribe el nombre de la organización.",
        slug: "Usa de 3 a 63 letras minúsculas, números o guiones, sin guion al principio ni al final.",
      },
    });
    expect(parseOrganizationInput({ name: "x".repeat(121), slug: "valido" })).toEqual({
      ok: false,
      errors: { name: "El nombre no puede superar los 120 caracteres." },
    });
  });

  it("reserva rutas propias de la aplicación", () => {
    expect(parseOrganizationInput({ name: "API", slug: "api" })).toEqual({
      ok: false,
      errors: { slug: "Esa dirección está reservada. Elige otra." },
    });
  });
});

describe("parseInvitationInput", () => {
  it("normaliza el email y aplica el alcance por defecto", () => {
    expect(parseInvitationInput({ email: "  Nueva@Example.TEST ", role: "ACCOUNTANT" })).toEqual({
      ok: true,
      value: { email: "nueva@example.test", role: "ACCOUNTANT", taxpayerScope: "ALL_TAXPAYERS" },
    });
  });

  it("rechaza emails mal formados, roles desconocidos y el rol OWNER", () => {
    expect(parseInvitationInput({ email: "no-es-un-email", role: "SUPERADMIN" })).toEqual({
      ok: false,
      errors: { email: "Escribe un email válido.", role: "Elige un rol." },
    });
    expect(parseInvitationInput({ email: "a@example.test", role: "OWNER" })).toEqual({
      ok: false,
      errors: { role: "La propiedad no se invita: se transfiere desde Equipo." },
    });
  });
});

describe("parseInvoiceSendInput", () => {
  it("normaliza el destinatario y deja el mensaje en null si está vacío", () => {
    expect(parseInvoiceSendInput({ to: "  Compras@Cliente.TEST ", note: "   " })).toEqual({ ok: true, value: { to: "compras@cliente.test", note: null } });
    expect(parseInvoiceSendInput({ to: "a@b.test", note: " Hola,\nte lo adjunto. " })).toEqual({ ok: true, value: { to: "a@b.test", note: "Hola,\nte lo adjunto." } });
  });

  it("rechaza un email mal formado y un mensaje demasiado largo", () => {
    expect(parseInvoiceSendInput({ to: "no-es-un-email", note: "x".repeat(2001) })).toEqual({
      ok: false,
      errors: { to: "Escribe un email válido.", note: "El mensaje puede tener como mucho 2000 caracteres." },
    });
    expect(parseInvoiceSendInput({})).toMatchObject({ ok: false, errors: { to: "Escribe un email válido." } });
  });
});
