// Registros de facturación de alta y anulación (OM HAC/1177/2024, arts. 7, 10, 11 y 13). La cadena se prueba
// con los tres ejemplos oficiales de la especificación de la huella (v0.1.2, apartado 6): el constructor de
// registros debe producir exactamente las huellas publicadas por la AEAT.
import type { TaxBreakdown } from "@facturalibre/fiscal-core";
import { describe, expect, it } from "vitest";
import { fingerprint } from "../src/hash";
import { buildAlta, buildAnulacion, chainLinkOf, describeOperation, validateAlta, validateSoftware, type AltaData, type RecordContext } from "../src/record";

const VAT21 = (base: bigint, quota: bigint): TaxBreakdown => ({
  key: "VAT:2100",
  tax: { kind: "VAT", ratePercent: 2100n },
  base,
  quota,
  surchargePercent: 0n,
  surchargeQuota: 0n,
});

const software = { producerName: "Productor Ficticio SL", producerNif: "B12345674", name: "FacturaLibre", id: "FL", version: "0.5.0" };
const system = { installationNumber: "019a0000-0000-7000-8000-000000000001", multipleTaxpayers: false };
const context = (generatedAt: string, previous: RecordContext["previous"]): RecordContext => ({ previous, system, software, generatedAt });

/** Factura del caso oficial: CuotaTotal 12.35 e ImporteTotal 123.45. */
const officialCase = (number: string): AltaData => ({
  invoice: { issuerNif: "89890001K", number, issueDate: "2024-01-01" },
  issuerName: "Emisor Ficticio",
  type: "F1",
  rectified: [],
  description: "Venta",
  recipient: { name: "Cliente Ficticio", nif: "B12345674" },
  details: [VAT21(11110n, 1235n)],
});

describe("cadena de registros con los ejemplos oficiales", () => {
  const first = buildAlta(officialCase("12345678/G33"), context("2024-01-01T19:20:30+01:00", null));
  const second = buildAlta(officialCase("12345679/G34"), context("2024-01-01T19:20:35+01:00", chainLinkOf(first)));
  const annulment = buildAnulacion({ issuerNif: "89890001K", number: "12345679/G34", issueDate: "2024-01-01" }, context("2024-01-01T19:20:40+01:00", chainLinkOf(second)));

  it("caso 1: primer registro", () => {
    expect(first).toMatchObject({ kind: "ALTA", cuotaTotal: "12.35", importeTotal: "123.45" });
    expect(first.hash).toBe("3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60");
  });

  it("caso 2: encadenado al anterior", () => {
    expect(chainLinkOf(first)).toEqual({ issuerNif: "89890001K", number: "12345678/G33", issueDate: "2024-01-01", hash: first.hash });
    expect(second.hash).toBe("F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97");
  });

  it("caso 3: anulación encadenada", () => {
    expect(annulment.kind).toBe("ANULACION");
    expect(annulment.hash).toBe("177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68");
    expect(chainLinkOf(annulment)).toEqual({ issuerNif: "89890001K", number: "12345679/G34", issueDate: "2024-01-01", hash: annulment.hash });
  });
});

describe("una anulación como primer registro de la cadena", () => {
  it("se calcula con la huella anterior vacía («Huella=»)", () => {
    const invoice = { issuerNif: "89890001K", number: "12345679/G34", issueDate: "2024-01-01" };
    const record = buildAnulacion(invoice, context("2024-01-01T19:20:40+01:00", null));
    expect(record.hash).toBe(
      fingerprint("IDEmisorFacturaAnulada=89890001K&NumSerieFacturaAnulada=12345679/G34&FechaExpedicionFacturaAnulada=01-01-2024&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:40+01:00"),
    );
  });
});

describe("importes del registro de alta (validaciones 16 y 17 de la AEAT)", () => {
  it("CuotaTotal = Σ cuotas + recargos; ImporteTotal = Σ bases + cuotas + recargos (sin la retención de IRPF)", () => {
    const record = buildAlta(
      {
        ...officialCase("F2026-0001"),
        details: [
          { key: "VAT:2100", tax: { kind: "VAT", ratePercent: 2100n }, base: 10000n, quota: 2100n, surchargePercent: 520n, surchargeQuota: 520n },
          { key: "EXEMPT:E1", tax: { kind: "EXEMPT", cause: "E1" }, base: 5000n, quota: 0n, surchargePercent: 0n, surchargeQuota: 0n },
        ],
      },
      context("2026-11-24T10:00:00+01:00", null),
    );
    expect(record).toMatchObject({ cuotaTotal: "26.20", importeTotal: "176.20" });
  });

  it("rectificativa por diferencias: importes negativos", () => {
    const record = buildAlta({ ...officialCase("R2026-0001"), type: "R1", rectified: [officialCase("F2026-0001").invoice], details: [VAT21(-13550n, -2846n)] }, context("2026-11-24T10:00:00+01:00", null));
    expect(record).toMatchObject({ cuotaTotal: "-28.46", importeTotal: "-163.96" });
  });
});

describe("validación antes de generar el registro de alta", () => {
  const valid = officialCase("F2026-0001");

  it("una factura completa correcta no tiene errores", () => {
    expect(validateAlta(valid)).toEqual({});
  });

  it("límites admitidos: nombres de 1 y de 120 caracteres, 12 detalles, descripción de 500", () => {
    expect(
      validateAlta({ ...valid, issuerName: "x".repeat(120), recipient: { name: "x", nif: "B12345674" }, description: "x".repeat(500), details: Array.from({ length: 12 }, () => VAT21(1n, 0n)) }),
    ).toEqual({});
    expect(validateAlta({ ...valid, recipient: { name: "x".repeat(120), nif: "B12345674" }, description: "x" })).toEqual({});
  });

  it("el destinatario de una factura completa debe estar identificado con NIF (validación 13)", () => {
    expect(validateAlta({ ...valid, recipient: { name: "Sin NIF", nif: null } })).toEqual({
      recipient: "El cliente necesita NIF: una factura completa debe identificar al destinatario.",
    });
  });

  it("número de serie: ASCII imprimible, sin comillas, <, > ni =, y hasta 60 caracteres (validación 3.1.3.1)", () => {
    for (const number of ['F"1', "F'1", "F<1", "F>1", "F=1", "Fñ1", "F\t1", "x".repeat(61), ""]) {
      expect(validateAlta({ ...valid, invoice: { ...valid.invoice, number } })).toEqual({
        number: "El número de factura solo puede llevar caracteres ASCII imprimibles (sin comillas, <, > ni =) y hasta 60.",
      });
    }
    expect(validateAlta({ ...valid, invoice: { ...valid.invoice, number: `${"x".repeat(55)} &/-.` } })).toEqual({});
  });

  it("nombres de hasta 120 caracteres y descripción de 1 a 500", () => {
    expect(validateAlta({ ...valid, issuerName: "x".repeat(121), recipient: { name: "", nif: "B12345674" }, description: "x".repeat(501) })).toEqual({
      issuerName: "El nombre del emisor no puede superar los 120 caracteres.",
      recipient: "El nombre del cliente debe tener entre 1 y 120 caracteres.",
      description: "La descripción de la operación debe tener entre 1 y 500 caracteres.",
    });
    expect(validateAlta({ ...valid, issuerName: "", description: "" })).toEqual({
      issuerName: "Falta el nombre del emisor.",
      description: "La descripción de la operación debe tener entre 1 y 500 caracteres.",
    });
  });

  it("desglose: entre 1 y 12 detalles y con causa en cada exención", () => {
    expect(validateAlta({ ...valid, details: [] })).toEqual({ details: "La factura no tiene importes que declarar." });
    expect(validateAlta({ ...valid, details: Array.from({ length: 13 }, () => VAT21(1n, 0n)) })).toEqual({ details: "Una factura admite como máximo 12 tipos impositivos distintos." });
    const legacy: TaxBreakdown = { key: "EXEMPT", tax: { kind: "EXEMPT", cause: null }, base: 100n, quota: 0n, surchargePercent: 0n, surchargeQuota: 0n };
    expect(validateAlta({ ...valid, details: [VAT21(100n, 21n), legacy] })).toEqual({ details: "Indica la causa de la exención en todas las líneas exentas." });
    const withCause: TaxBreakdown = { ...legacy, key: "EXEMPT:E6", tax: { kind: "EXEMPT", cause: "E6" } };
    expect(validateAlta({ ...valid, details: [withCause] })).toEqual({});
  });

  it("las rectificativas identifican la factura rectificada; las ordinarias no", () => {
    expect(validateAlta({ ...valid, type: "R1" })).toEqual({ rectified: "Una rectificativa debe identificar la factura que rectifica." });
    expect(validateAlta({ ...valid, rectified: [valid.invoice] })).toEqual({ rectified: "Solo una rectificativa identifica facturas rectificadas." });
    expect(validateAlta({ ...valid, type: "R4", rectified: [valid.invoice] })).toEqual({});
  });
});

describe("identificación del sistema informático (validación 3.1.5 y XSD)", () => {
  it("datos correctos", () => {
    expect(validateSoftware(software)).toEqual([]);
  });

  it("cada campo con su formato", () => {
    expect(validateSoftware({ producerName: "", producerNif: "123", name: "x".repeat(31), id: "Ñ1", version: "" })).toEqual([
      "producerName: entre 1 y 120 caracteres",
      "producerNif: NIF de 9 caracteres",
      "name: entre 1 y 30 caracteres",
      "id: 2 caracteres, letras mayúsculas (sin Ñ) o dígitos",
      "version: entre 1 y 50 caracteres",
    ]);
    expect(validateSoftware({ ...software, id: "F" })).toEqual(["id: 2 caracteres, letras mayúsculas (sin Ñ) o dígitos"]);
    // Exactamente: ni un carácter más por delante ni por detrás.
    expect(validateSoftware({ ...software, id: "FLX", producerNif: "B123456745" })).toEqual([
      "producerNif: NIF de 9 caracteres",
      "id: 2 caracteres, letras mayúsculas (sin Ñ) o dígitos",
    ]);
    expect(validateSoftware({ ...software, producerName: "x".repeat(121), version: "x".repeat(51) })).toHaveLength(2);
  });
});

describe("descripción de la operación (DescripcionOperacion, obligatoria, ≤ 500)", () => {
  it("une las descripciones de las líneas", () => {
    expect(describeOperation(["Reparación de caldera", " Hora de trabajo ", "Reparación de caldera"])).toBe("Reparación de caldera; Hora de trabajo");
  });

  it("500 caracteres exactos caben sin recortar", () => {
    expect(describeOperation(["a".repeat(500)])).toBe("a".repeat(500));
  });

  it("recorta a 500 caracteres", () => {
    const text = describeOperation(["a".repeat(300), "b".repeat(300)]);
    expect(text).toHaveLength(500);
    expect(text.endsWith("…")).toBe(true);
  });
});
