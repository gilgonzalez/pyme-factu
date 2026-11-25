// Entornos (R-19: nunca registros reales desde desarrollo o pruebas) y calendario de envíos (OM HAC/1177/2024,
// art. 16: control de flujo y reintento al menos cada hora). Endpoints: SistemaFacturacion.wsdl 1.0.
import { describe, expect, it } from "vitest";
import { endpointFor } from "../src/environment";
import { nextSendDelaySeconds, retryDelaySeconds } from "../src/schedule";

describe("a dónde se envía según FACTURALIBRE_ENV", () => {
  it("producción: el servicio VERI*FACTU de producción", () => {
    expect(endpointFor("production")).toEqual({ kind: "aeat", url: "https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP" });
  });

  it("test: el portal de pruebas externas de la AEAT", () => {
    expect(endpointFor("test")).toEqual({ kind: "aeat", url: "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP" });
  });

  it("desarrollo, sin definir o cualquier otro valor: el simulador local, nunca la AEAT", () => {
    for (const value of ["development", undefined, "", "PRODUCTION", "prod", "staging"]) expect(endpointFor(value)).toEqual({ kind: "simulator" });
  });
});

describe("control de flujo (art. 16.2)", () => {
  it("se espera el tiempo que indica la AEAT, salvo que ya haya 1.000 registros pendientes", () => {
    expect(nextSendDelaySeconds(60, 0)).toBe(60);
    expect(nextSendDelaySeconds(120, 999)).toBe(120);
    expect(nextSendDelaySeconds(60, 1000)).toBe(0);
    expect(nextSendDelaySeconds(60, 1500)).toBe(0);
  });
});

describe("reintentos tras una incidencia (art. 16.4: al menos una vez cada hora)", () => {
  it("espera creciente desde 1 minuto y nunca más de 1 hora", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 20].map(retryDelaySeconds)).toEqual([60, 120, 240, 480, 960, 1920, 3600, 3600, 3600]);
  });

  it("sin fallos previos, el primer reintento es al minuto", () => {
    expect(retryDelaySeconds(0)).toBe(60);
  });
});
