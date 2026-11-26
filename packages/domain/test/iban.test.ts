// IBAN (ISO 13616): normalización, longitud por país y dígitos de control (mod 97). Cuentas de ejemplo, no reales.
import { describe, expect, it } from "vitest";
import { formatIban, parseIban } from "../src";

describe("parseIban", () => {
  it.each([
    ["ES9121000418450200051332", "ES9121000418450200051332"],
    [" es91 2100 0418 4502 0005 1332 ", "ES9121000418450200051332"],
    ["ES91-2100-0418-4502-0005-1332", "ES9121000418450200051332"],
    ["DE89370400440532013000", "DE89370400440532013000"],
    ["PT50000201231234567890154", "PT50000201231234567890154"],
  ])("%s es válido → %s", (raw, iban) => {
    expect(parseIban(raw)).toEqual({ ok: true, value: iban });
  });

  it("detecta un dígito cambiado (control mod 97)", () => {
    expect(parseIban("ES9121000418450200051333")).toEqual({ ok: false, error: "CHECK_DIGITS" });
  });

  it.each([
    ["ES912100041845020005133", "LENGTH"], // a un IBAN español le falta una cifra
    ["ES91210004184502000513321", "LENGTH"],
    ["XX9121000418450200051332", "COUNTRY"], // país desconocido
    ["ES91 2100 0418 4502 0005 133A", "FORMAT"], // el BBAN español es solo de cifras
    ["9121000418450200051332", "FORMAT"],
    ["", "FORMAT"],
  ])("%s → %s", (raw, error) => {
    expect(parseIban(raw)).toEqual({ ok: false, error });
  });
});

describe("formatIban", () => {
  it("lo agrupa de cuatro en cuatro, como se imprime en papel", () => {
    expect(formatIban("ES9121000418450200051332")).toBe("ES91 2100 0418 4502 0005 1332");
    expect(formatIban("DE89370400440532013000")).toBe("DE89 3704 0044 0532 0130 00");
  });
});
