// Huella de los registros: vectores oficiales de la AEAT, «Detalle de las especificaciones técnicas para
// generación de la huella o hash de los registros de facturación», v0.1.2 (27/08/2024), apartado 6.
import { describe, expect, it } from "vitest";
import { altaHashInput, anulacionHashInput, fingerprint } from "../src/hash";

describe("huella de un registro de alta", () => {
  it("caso 1 oficial: primer registro, sin huella anterior", () => {
    const input = altaHashInput({
      issuerNif: "89890001K",
      invoiceNumber: "12345678/G33",
      issueDate: "01-01-2024",
      invoiceType: "F1",
      cuotaTotal: "12.35",
      importeTotal: "123.45",
      previousHash: "",
      generatedAt: "2024-01-01T19:20:30+01:00",
    });
    expect(input).toBe(
      "IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00",
    );
    expect(fingerprint(input)).toBe("3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60");
  });

  it("caso 2 oficial: encadenado con la huella del registro anterior", () => {
    const input = altaHashInput({
      issuerNif: "89890001K",
      invoiceNumber: "12345679/G34",
      issueDate: "01-01-2024",
      invoiceType: "F1",
      cuotaTotal: "12.35",
      importeTotal: "123.45",
      previousHash: "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60",
      generatedAt: "2024-01-01T19:20:35+01:00",
    });
    expect(fingerprint(input)).toBe("F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97");
  });

  it("quita los espacios al principio y al final de cada valor (apartado 3)", () => {
    const fields = {
      issuerNif: "89890001K",
      invoiceNumber: " 12345678/G33 ",
      issueDate: "01-01-2024",
      invoiceType: "F1",
      cuotaTotal: "12.35",
      importeTotal: "123.45",
      previousHash: "",
      generatedAt: "2024-01-01T19:20:30+01:00",
    };
    expect(fingerprint(altaHashInput(fields))).toBe("3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60");
  });
});

describe("huella de un registro de anulación", () => {
  it("caso 3 oficial", () => {
    const input = anulacionHashInput({
      issuerNif: "89890001K",
      invoiceNumber: "12345679/G34",
      issueDate: "01-01-2024",
      previousHash: "F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97",
      generatedAt: "2024-01-01T19:20:40+01:00",
    });
    expect(input).toBe(
      "IDEmisorFacturaAnulada=89890001K&NumSerieFacturaAnulada=12345679/G34&FechaExpedicionFacturaAnulada=01-01-2024&Huella=F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97&FechaHoraHusoGenRegistro=2024-01-01T19:20:40+01:00",
    );
    expect(fingerprint(input)).toBe("177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68");
  });
});

describe("formato de salida (apartado 5)", () => {
  it("SHA-256 en hexadecimal, mayúsculas, 64 caracteres; codifica la entrada en UTF-8", () => {
    expect(fingerprint("")).toBe("E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855");
    // «ñ» en UTF-8 son dos bytes (C3 B1); en Latin-1 sería uno (F1) y daría D4F09E5C…
    expect(fingerprint("ñ")).toBe("024BB90888CA89A15A19E9BDD8C712BFB070465FCE1EF25E43C170EA44FC5E5F");
  });
});
