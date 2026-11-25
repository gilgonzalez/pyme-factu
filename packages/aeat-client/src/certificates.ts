// Certificados electrónicos (OM HAC/1177/2024, arts. 4.b y 5): se guardan cifrados por sobre. Cada certificado
// se cifra con una clave propia (DEK, AES-256-GCM) y esa clave se cifra con la KEK del despliegue
// (CERTIFICATE_KEK), que nunca está en la base de datos. Solo se descifra en memoria al enviar.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createSecureContext } from "node:tls";
import type { Credentials } from "./transport";

const KEY_BYTES = 32;
const IV_BYTES = 12;

/** CERTIFICATE_KEK: 32 bytes aleatorios en base64 (`openssl rand -base64 32`). */
export function parseKek(value: string | undefined): Buffer {
  const key = typeof value === "string" ? Buffer.from(value, "base64") : Buffer.alloc(0);
  if (key.length !== KEY_BYTES) throw new Error("CERTIFICATE_KEK debe ser una clave de 32 bytes en base64.");
  return key;
}

interface Box {
  readonly iv: string;
  readonly tag: string;
  readonly data: string;
}

function seal(key: Buffer, plaintext: Buffer): Box {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}

function open(key: Buffer, box: Box): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(box.iv, "base64"));
  decipher.setAuthTag(Buffer.from(box.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(box.data, "base64")), decipher.final()]);
}

/** Texto JSON con el certificado y su contraseña cifrados (formato v1). */
export function sealCertificate(kek: Buffer, credentials: Credentials): string {
  const dek = randomBytes(KEY_BYTES);
  const payload = Buffer.from(JSON.stringify({ pfx: credentials.pfx.toString("base64"), passphrase: credentials.passphrase }), "utf8");
  const wrapped = seal(kek, dek);
  return JSON.stringify({ v: 1, key: wrapped, ...seal(dek, payload) });
}

export function openCertificate(kek: Buffer, sealed: string): Credentials {
  const parsed = JSON.parse(sealed) as { v?: unknown; key: Box } & Box;
  if (parsed.v !== 1) throw new Error("Formato de certificado cifrado no reconocido.");
  const payload = JSON.parse(open(open(kek, parsed.key), parsed).toString("utf8")) as { pfx: string; passphrase: string };
  return { pfx: Buffer.from(payload.pfx, "base64"), passphrase: payload.passphrase };
}

/** ¿El PKCS#12 se abre con esa contraseña y contiene clave y certificado utilizables para TLS? */
export function checkCertificate(pfx: Buffer, passphrase: string): boolean {
  try {
    createSecureContext({ pfx, passphrase });
    return true;
  } catch {
    return false;
  }
}
