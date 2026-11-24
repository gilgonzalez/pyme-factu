// Identificadores ficticios calculados con los algoritmos oficiales; ninguno corresponde a una persona o entidad real.
import { describe, expect, it } from "vitest";
import { nifErrorMessage, parseNif } from "../src";

describe("parseNif — personas físicas", () => {
  it.each([
    ["12345678Z", "DNI"],
    ["00000000T", "DNI"],
    ["X1234567L", "NIE"],
    ["Y1234567X", "NIE"],
    ["Z1234567R", "NIE"],
    ["K1234567L", "NIF_ESPECIAL"],
    ["L1234567L", "NIF_ESPECIAL"],
    ["M1234567L", "NIF_ESPECIAL"],
  ])("%s es un %s válido de persona física", (nif, kind) => {
    expect(parseNif(nif)).toEqual({ ok: true, value: { nif, kind, personType: "NATURAL_PERSON" } });
  });

  it.each([["12345678A"], ["X1234567A"], ["K1234567A"]])("%s tiene la letra de control equivocada", (nif) => {
    expect(parseNif(nif)).toEqual({ ok: false, error: "CHECK_DIGIT" });
  });
});

describe("parseNif — personas jurídicas y entidades (antiguo CIF)", () => {
  it.each([
    ["B12345674"], // B: control numérico obligatorio
    ["A12345674"],
    ["G12345674"], // G: admite número…
    ["G1234567D"], // …o letra
    ["Q1234567D"], // Q: control con letra obligatorio
    ["P1234567D"],
    ["S1234567D"],
    ["N1234567D"],
    ["W1234567D"],
    ["R1234567D"],
    ["E12345674"],
    ["H12345674"],
  ])("%s es válido", (nif) => {
    expect(parseNif(nif)).toEqual({ ok: true, value: { nif, kind: "CIF", personType: "LEGAL_ENTITY" } });
  });

  it.each([
    ["B12345675", "dígito equivocado"],
    ["B1234567D", "B exige número"],
    ["A1234567D", "A exige número"],
    ["Q12345674", "Q exige letra"],
    ["P12345674", "P exige letra"],
    ["G1234567E", "letra equivocada"],
    ["N12345674", "N exige letra"],
    ["R12345674", "R exige letra"],
    ["S12345674", "S exige letra"],
    ["W12345674", "W exige letra"],
    ["E1234567D", "E exige número"],
    ["H1234567D", "H exige número"],
  ])("%s no es válido (%s)", (nif) => {
    expect(parseNif(nif)).toEqual({ ok: false, error: "CHECK_DIGIT" });
  });

  it("calcula bien cuando la suma es múltiplo de 10 (control 0 / J)", () => {
    // 0000000 → suma 0 → control 0 (o J con letra).
    expect(parseNif("B00000000")).toMatchObject({ ok: true });
    expect(parseNif("Q0000000J")).toMatchObject({ ok: true });
  });
});

describe("parseNif — normalización y formato", () => {
  it("acepta minúsculas, espacios, guiones y puntos, y devuelve la forma canónica", () => {
    expect(parseNif(" 12.345.678-z ")).toEqual({ ok: true, value: { nif: "12345678Z", kind: "DNI", personType: "NATURAL_PERSON" } });
    expect(parseNif("b-1234567-4")).toMatchObject({ ok: true, value: { nif: "B12345674" } });
  });

  it.each([[""], ["1234567Z"], ["123456789Z"], ["I1234567D"], ["O12345674"], ["ES12345678Z"], ["12345678Ñ"], ["12345678ZZ"], ["X1234567LL"], ["AX1234567L"], ["K1234567LL"], ["AK1234567L"], ["B123456744"], ["1B12345674"], [null], [12345678]])(
    "%j no tiene formato de NIF",
    (input) => {
      expect(parseNif(input)).toEqual({ ok: false, error: "FORMAT" });
    },
  );
});

describe("nifErrorMessage", () => {
  it("explica cada error en español", () => {
    expect(nifErrorMessage("FORMAT")).toBe("Escribe un NIF de 9 caracteres: 8 números y una letra (DNI), o letra, 7 números y control.");
    expect(nifErrorMessage("CHECK_DIGIT")).toBe("El NIF no es válido: revisa el último carácter (control).");
  });
});
