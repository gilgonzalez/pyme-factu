import "server-only";
import type { VerifactuSettings } from "@facturalibre/tenancy";
import { validateSoftware, type QrEnvironment, type Software } from "@facturalibre/verifactu";

// Identidad del sistema informático de facturación (ADR-008, decisión 10). En producción los datos del productor
// son obligatorios; fuera de ella se usa un marcador evidente: esos registros nunca se remiten a la AEAT real.

const isProduction = (): boolean => process.env["FACTURALIBRE_ENV"] === "production";

const DEVELOPMENT_DEFAULTS: Readonly<Record<string, string>> = {
  SIF_PRODUCER_NAME: "Productor sin configurar (entorno de desarrollo)",
  SIF_PRODUCER_NIF: "00000000T",
};

function setting(name: string, fallback?: string): string {
  const value = process.env[name]?.trim();
  if (value !== undefined && value !== "") return value;
  const development = isProduction() ? undefined : DEVELOPMENT_DEFAULTS[name];
  const resolved = fallback ?? development;
  if (resolved === undefined) throw new Error(`Falta la variable de entorno ${name} (obligatoria en producción).`);
  return resolved;
}

/** Datos del sistema informático, validados (un dato mal configurado haría rechazar todos los registros). */
export function softwareIdentity(): Software {
  const software: Software = {
    producerName: setting("SIF_PRODUCER_NAME"),
    producerNif: setting("SIF_PRODUCER_NIF"),
    name: "FacturaLibre",
    id: setting("SIF_ID", "FL"),
    version: setting("SIF_VERSION", "0.1.0"),
  };
  const problems = validateSoftware(software);
  if (problems.length > 0) throw new Error(`Configuración VERI*FACTU no válida: ${problems.join("; ")}`);
  return software;
}

export const verifactuSettings = (): VerifactuSettings => ({ software: softwareIdentity() });

/** El QR apunta al servicio de cotejo de producción solo cuando FacturaLibre funciona en producción. */
export const qrEnvironment = (): QrEnvironment => (isProduction() ? "production" : "test");
