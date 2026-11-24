// Formatos de los campos del registro: XSD SuministroInformacion (tipos fecha, ImporteSgn12.2, Tipo2.2) y
// «Descripción de los servicios web» v1.0.3, apartado 6.8 (sin ceros a la izquierda, "." decimal).
import { describe, expect, it } from "vitest";
import { aeatAmount, aeatDate, aeatPercent, generationTimestamp } from "../src/format";

describe("fecha de expedición (DD-MM-AAAA)", () => {
  it("convierte una fecha ISO", () => {
    expect(aeatDate("2024-09-01")).toBe("01-09-2024");
  });

  it("rechaza lo que no es exactamente una fecha ISO", () => {
    expect(() => aeatDate("1/9/2024")).toThrow("Fecha ISO no válida: 1/9/2024");
    expect(() => aeatDate("2024-09-01T00:00")).toThrow(RangeError);
    expect(() => aeatDate("x2024-09-01")).toThrow(RangeError);
  });
});

describe("importes (céntimos → «123.45»)", () => {
  it.each([
    [0n, "0.00"],
    [5n, "0.05"],
    [1234n, "12.34"],
    [13140n, "131.40"],
    [-40n, "-0.40"],
    [-16396n, "-163.96"],
    [99_999_999_999_999n, "999999999999.99"],
  ])("%s → %s", (cents, text) => {
    expect(aeatAmount(cents)).toBe(text);
  });

  it("no admite más de 12 dígitos enteros", () => {
    expect(() => aeatAmount(100_000_000_000_000n)).toThrow("El importe supera los 12 dígitos enteros que admite la AEAT.");
    expect(() => aeatAmount(-100_000_000_000_000n)).toThrow(RangeError);
  });
});

describe("tipos impositivos (escala 2 → «21», «5.2»)", () => {
  it.each([
    [2100n, "21"],
    [1000n, "10"],
    [400n, "4"],
    [0n, "0"],
    [520n, "5.2"],
    [140n, "1.4"],
    [50n, "0.5"],
    [175n, "1.75"],
    [5n, "0.05"],
    [105n, "1.05"],
    [99_999n, "999.99"],
  ])("%s → %s", (scaled, text) => {
    expect(aeatPercent(scaled)).toBe(text);
  });

  it("fuera de rango", () => {
    expect(() => aeatPercent(-1n)).toThrow("Porcentaje fuera de rango.");
    expect(() => aeatPercent(100_000n)).toThrow(RangeError);
  });
});

describe("fecha, hora y huso de generación (ISO 8601 con huso)", () => {
  it("horario de invierno en la España peninsular", () => {
    expect(generationTimestamp(new Date("2024-01-01T18:20:30Z"))).toBe("2024-01-01T19:20:30+01:00");
  });

  it("horario de verano", () => {
    expect(generationTimestamp(new Date("2024-07-01T10:00:05Z"))).toBe("2024-07-01T12:00:05+02:00");
  });

  it("medianoche local (no «24:00:00»)", () => {
    expect(generationTimestamp(new Date("2024-01-01T23:00:00Z"))).toBe("2024-01-02T00:00:00+01:00");
  });

  it("otro territorio: Canarias en invierno es UTC (+00:00)", () => {
    expect(generationTimestamp(new Date("2024-01-01T18:20:30Z"), "Atlantic/Canary")).toBe("2024-01-01T18:20:30+00:00");
  });
});
