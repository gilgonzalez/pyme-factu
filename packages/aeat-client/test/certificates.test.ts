// Certificados: cifrado por sobre (la KEK nunca está en la base de datos) y validación del PKCS#12. El certificado
// de prueba es autofirmado y ficticio, generado en memoria: nunca se usan ni se guardan certificados reales.
import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { checkCertificate, openCertificate, parseKek, sealCertificate } from "../src/certificates";
import { fictitiousCertificate } from "./support";

const PASSPHRASE = "contraseña-ficticia";
const kek = randomBytes(32);
let pfx: Buffer;

beforeAll(() => {
  pfx = fictitiousCertificate("Persona Ficticia - 12345678Z", PASSPHRASE).pfx;
});

describe("clave de cifrado de certificados (KEK)", () => {
  it("32 bytes en base64", () => {
    expect(parseKek(kek.toString("base64"))).toEqual(kek);
  });

  it("cualquier otra cosa no sirve", () => {
    for (const value of [undefined, "", "corta", randomBytes(16).toString("base64"), randomBytes(33).toString("base64")]) {
      expect(() => parseKek(value)).toThrow("CERTIFICATE_KEK debe ser una clave de 32 bytes en base64.");
    }
  });
});

describe("cifrado por sobre", () => {
  it("lo cifrado se recupera solo con la misma KEK", () => {
    const sealed = sealCertificate(kek, { pfx, passphrase: PASSPHRASE });
    expect(sealed).not.toContain(PASSPHRASE);
    expect(sealed).not.toContain(pfx.toString("base64"));
    const opened = openCertificate(kek, sealed);
    expect(opened.passphrase).toBe(PASSPHRASE);
    expect(opened.pfx.equals(pfx)).toBe(true);
    expect(() => openCertificate(randomBytes(32), sealed)).toThrow();
  });

  it("cada cifrado es distinto (claves y vectores aleatorios) y una manipulación se detecta", () => {
    const first = sealCertificate(kek, { pfx, passphrase: PASSPHRASE });
    expect(sealCertificate(kek, { pfx, passphrase: PASSPHRASE })).not.toBe(first);
    const parsed = JSON.parse(first) as Record<string, string>;
    const tampered = JSON.stringify({ ...parsed, data: Buffer.from("otro contenido").toString("base64") });
    expect(() => openCertificate(kek, tampered)).toThrow();
    expect(() => openCertificate(kek, JSON.stringify({ ...parsed, v: 2 }))).toThrow("Formato de certificado cifrado no reconocido.");
  });
});

describe("validación del certificado (PKCS#12 + contraseña)", () => {
  it("válido con su contraseña; no con otra ni si no es un PKCS#12", () => {
    expect(checkCertificate(pfx, PASSPHRASE)).toBe(true);
    expect(checkCertificate(pfx, "otra")).toBe(false);
    expect(checkCertificate(Buffer.from("no es un certificado"), PASSPHRASE)).toBe(false);
  });
});
