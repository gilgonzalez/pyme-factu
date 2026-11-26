import { describe, expect, it } from "vitest";
import { parseBillingSettings, parseInvitationInput, parseInvoiceSendInput, parseLogo, parseOrganizationInput, parseTaxpayerDetails, suggestSlug } from "../src";

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

describe("parseTaxpayerDetails — contacto y datos registrales", () => {
  const base = { legalName: "Fontanería Ficticia SL" };

  it("guarda teléfono, web y datos registrales (vacíos → null)", () => {
    expect(parseTaxpayerDetails({ ...base, phone: " +34 600 12 34 56 ", website: "fontaneria.example", registryInfo: " Inscrita en el R. M. de Madrid, tomo 1, folio 2, hoja M-3 " })).toMatchObject({
      ok: true,
      value: { phone: "+34 600 12 34 56", website: "fontaneria.example", registryInfo: "Inscrita en el R. M. de Madrid, tomo 1, folio 2, hoja M-3" },
    });
    expect(parseTaxpayerDetails({ ...base, phone: "", website: " ", registryInfo: "" })).toMatchObject({ ok: true, value: { phone: null, website: null, registryInfo: null } });
  });

  it("rechaza un teléfono con letras, una web con espacios y textos demasiado largos", () => {
    expect(parseTaxpayerDetails({ ...base, phone: "llámame", website: "mi web.com", registryInfo: "x".repeat(301) })).toEqual({
      ok: false,
      errors: {
        phone: "Escribe solo cifras, espacios y, si quieres, el prefijo (+34).",
        website: "Escribe una dirección web, por ejemplo www.tuempresa.es.",
        registryInfo: "No puede superar los 300 caracteres.",
      },
    });
  });
});

describe("parseBillingSettings", () => {
  it("normaliza el IBAN y convierte plazo, retención e IVA por defecto", () => {
    expect(
      parseBillingSettings({
        iban: "es91 2100 0418 4502 0005 1332",
        paymentInstructions: " También por Bizum al 600 123 456. ",
        paymentTermsDays: "30",
        defaultWithholdingPercent: "15",
        defaultTaxKey: "EXEMPT:E1",
        footerNote: "Gracias por su confianza.",
        emailMessage: "Hola,\nte adjunto el documento.",
      }),
    ).toEqual({
      ok: true,
      value: {
        iban: "ES9121000418450200051332",
        paymentInstructions: "También por Bizum al 600 123 456.",
        paymentTermsDays: 30,
        defaultWithholdingPercent: 1500,
        defaultTaxKey: "EXEMPT:E1",
        footerNote: "Gracias por su confianza.",
        emailMessage: "Hola,\nte adjunto el documento.",
      },
    });
  });

  it("todo es opcional: vacío → null", () => {
    expect(parseBillingSettings({})).toEqual({
      ok: true,
      value: { iban: null, paymentInstructions: null, paymentTermsDays: null, defaultWithholdingPercent: null, defaultTaxKey: null, footerNote: null, emailMessage: null },
    });
  });

  it("explica por campo lo que no vale", () => {
    expect(
      parseBillingSettings({ iban: "ES9121000418450200051333", paymentTermsDays: "-3", defaultWithholdingPercent: "120", defaultTaxKey: "VAT:1800", footerNote: "x".repeat(1001) }),
    ).toEqual({
      ok: false,
      errors: {
        iban: "El IBAN no es válido: revisa las cifras (no cuadran los dígitos de control).",
        paymentTermsDays: "Escribe un número de días entre 0 y 3650.",
        defaultWithholdingPercent: "Escribe un porcentaje entre 0 y 100, con hasta 2 decimales.",
        defaultTaxKey: "Elige un tipo de IVA.",
        footerNote: "No puede superar los 1000 caracteres.",
      },
    });
  });
});

describe("parseLogo", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

  it("reconoce PNG y JPEG por su contenido, no por el nombre", () => {
    expect(parseLogo(png)).toEqual({ ok: true, value: { bytes: png, mimeType: "image/png" } });
    expect(parseLogo(jpeg)).toEqual({ ok: true, value: { bytes: jpeg, mimeType: "image/jpeg" } });
  });

  it("rechaza otros formatos, ficheros vacíos y los de más de 512 KB", () => {
    expect(parseLogo(new TextEncoder().encode("<svg></svg>"))).toEqual({ ok: false, error: "El logo tiene que ser una imagen PNG o JPEG." });
    expect(parseLogo(new Uint8Array())).toEqual({ ok: false, error: "Elige una imagen PNG o JPEG." });
    const big = new Uint8Array(512 * 1024 + 1);
    big.set(png);
    expect(parseLogo(big)).toEqual({ ok: false, error: "El logo no puede ocupar más de 512 KB." });
  });
});
