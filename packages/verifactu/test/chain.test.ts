// Comprobación de una cadena conservada: se recalcula la huella de cada registro desde sus campos guardados y
// se verifica que cada uno enlaza con el anterior. Datos: los tres ejemplos oficiales de la especificación.
import { describe, expect, it } from "vitest";
import { checkChain, type StoredRecord } from "../src/chain";

const official: StoredRecord[] = [
  {
    sequence: 1,
    kind: "ALTA",
    issuerNif: "89890001K",
    invoiceNumber: "12345678/G33",
    issueDate: "2024-01-01",
    invoiceType: "F1",
    cuotaTotal: "12.35",
    importeTotal: "123.45",
    previousHash: null,
    hash: "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60",
    generatedAt: "2024-01-01T19:20:30+01:00",
  },
  {
    sequence: 2,
    kind: "ALTA",
    issuerNif: "89890001K",
    invoiceNumber: "12345679/G34",
    issueDate: "2024-01-01",
    invoiceType: "F1",
    cuotaTotal: "12.35",
    importeTotal: "123.45",
    previousHash: "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60",
    hash: "F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97",
    generatedAt: "2024-01-01T19:20:35+01:00",
  },
  {
    sequence: 3,
    kind: "ANULACION",
    issuerNif: "89890001K",
    invoiceNumber: "12345679/G34",
    issueDate: "2024-01-01",
    invoiceType: null,
    cuotaTotal: null,
    importeTotal: null,
    previousHash: "F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97",
    hash: "177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68",
    generatedAt: "2024-01-01T19:20:40+01:00",
  },
];

const allOk = (sequence: number) => ({ sequence, hashOk: true, linkOk: true });

describe("comprobación de la cadena", () => {
  it("la cadena oficial es correcta registro a registro", () => {
    expect(checkChain(official)).toEqual([allOk(1), allOk(2), allOk(3)]);
  });

  it("detecta un dato alterado: su huella ya no coincide (el enlace sigue siendo el guardado)", () => {
    const tampered = official.map((record) => (record.sequence === 2 ? { ...record, importeTotal: "999.99" } : record));
    expect(checkChain(tampered)).toEqual([allOk(1), { sequence: 2, hashOk: false, linkOk: true }, allOk(3)]);
  });

  it("detecta un registro que no enlaza con el anterior o un salto de secuencia", () => {
    const [first, second, third] = official as [StoredRecord, StoredRecord, StoredRecord];
    expect(checkChain([first, { ...third, sequence: 2 }])).toEqual([allOk(1), { sequence: 2, hashOk: true, linkOk: false }]);
    expect(checkChain([first, { ...second, sequence: 3 }])).toEqual([allOk(1), { sequence: 3, hashOk: true, linkOk: false }]);
  });

  it("el primero debe ser la secuencia 1 sin huella anterior", () => {
    const [, second] = official as [StoredRecord, StoredRecord];
    expect(checkChain([second])).toEqual([{ sequence: 2, hashOk: true, linkOk: false }]);
    expect(checkChain([{ ...second, sequence: 1 }])).toEqual([{ sequence: 1, hashOk: true, linkOk: false }]);
  });

  it("una cadena vacía no tiene nada que comprobar", () => {
    expect(checkChain([])).toEqual([]);
  });
});
