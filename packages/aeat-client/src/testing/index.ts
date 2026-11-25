// Utilidades SOLO para pruebas (nunca se importan desde código de producción): certificados autofirmados
// FICTICIOS generados en memoria. node-forge es dependencia de desarrollo.
import forge from "node-forge";

export interface FictitiousCertificate {
  readonly pfx: Buffer;
  readonly keyPem: string;
  readonly certPem: string;
}

export function fictitiousCertificate(commonName: string, passphrase: string): FictitiousCertificate {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date("2026-01-01T00:00:00Z");
  certificate.validity.notAfter = new Date("2030-01-01T00:00:00Z");
  const subject = [{ name: "commonName", value: commonName }];
  certificate.setSubject(subject);
  certificate.setIssuer(subject);
  certificate.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [certificate], passphrase, { algorithm: "3des" });
  return {
    pfx: Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary"),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
    certPem: forge.pki.certificateToPem(certificate),
  };
}
