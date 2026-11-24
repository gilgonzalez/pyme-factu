import { describe, expect, it } from "vitest";
import { divideRoundHalfUp, formatAmount, formatDecimal, parseDecimal } from "../src";

describe("parseDecimal (entrada de formularios, coma o punto decimal)", () => {
  it.each([
    ["12,5", 2, 1250n],
    ["12.50", 2, 1250n],
    [" 3 ", 2, 300n],
    ["0,0050", 4, 50n],
    ["1000", 3, 1_000_000n],
  ])("%j con %i decimales → %s", (input, scale, value) => {
    expect(parseDecimal(input, scale)).toEqual({ ok: true, value });
  });

  it("acepta negativos solo si se permiten", () => {
    expect(parseDecimal("-1,5", 2, { allowNegative: true })).toEqual({ ok: true, value: -150n });
    expect(parseDecimal("-1,5", 2)).toEqual({ ok: false, error: "NEGATIVE" });
  });

  it("rechaza más decimales de los admitidos", () => {
    expect(parseDecimal("1,234", 2)).toEqual({ ok: false, error: "TOO_MANY_DECIMALS" });
  });

  it.each([["1.234,56"], ["abc"], [""], ["1,"], [",5"], ["1e3"], ["--1"], [null], [12]])("%j no es un número", (input) => {
    expect(parseDecimal(input, 2, { allowNegative: true })).toEqual({ ok: false, error: "FORMAT" });
  });
});

describe("divideRoundHalfUp (redondeo «mitad hacia arriba», simétrico en negativos)", () => {
  it.each([
    [5n, 10n, 1n],
    [4n, 10n, 0n],
    [15n, 10n, 2n],
    [-5n, 10n, -1n],
    [-4n, 10n, 0n],
    [-15n, 10n, -2n],
    [20n, 10n, 2n],
    [0n, 7n, 0n],
  ])("%s / %s → %s", (numerator, denominator, result) => {
    expect(divideRoundHalfUp(numerator, denominator)).toBe(result);
  });
});

describe("formatos en español", () => {
  it.each([
    [123456n, "1.234,56 €"],
    [100n, "1,00 €"],
    [5n, "0,05 €"],
    [0n, "0,00 €"],
    [-50n, "-0,50 €"],
    [-123456789n, "-1.234.567,89 €"],
  ])("formatAmount(%s) = %s", (cents, text) => {
    expect(formatAmount(cents)).toBe(text);
  });

  it("formatDecimal recorta ceros finales pero respeta la escala", () => {
    expect(formatDecimal(1_500n, 3)).toBe("1,5");
    expect(formatDecimal(2_000n, 3)).toBe("2");
    expect(formatDecimal(123_456n, 4)).toBe("12,3456");
    expect(formatDecimal(-50n, 2)).toBe("-0,5");
    expect(formatDecimal(1_050n, 3)).toBe("1,05");
  });
});
