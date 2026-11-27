import { describe, expect, it } from "vitest";
import { provinceForPostalCode } from "../src";

describe("provincia a partir del código postal", () => {
  it("los dos primeros dígitos dicen la provincia (01 Araba/Álava … 52 Melilla)", () => {
    expect(provinceForPostalCode("01001")).toBe("Araba/Álava");
    expect(provinceForPostalCode("08001")).toBe("Barcelona");
    expect(provinceForPostalCode("28001")).toBe("Madrid");
    expect(provinceForPostalCode("35001")).toBe("Las Palmas");
    expect(provinceForPostalCode("41001")).toBe("Sevilla");
    expect(provinceForPostalCode("46001")).toBe("Valencia");
    expect(provinceForPostalCode("51001")).toBe("Ceuta");
    expect(provinceForPostalCode("52001")).toBe("Melilla");
  });

  it("admite espacios alrededor y solo responde con un código completo y existente", () => {
    expect(provinceForPostalCode(" 28013 ")).toBe("Madrid");
    expect(provinceForPostalCode("2800")).toBeNull();
    expect(provinceForPostalCode("280011")).toBeNull();
    expect(provinceForPostalCode("00001")).toBeNull();
    expect(provinceForPostalCode("53001")).toBeNull();
    expect(provinceForPostalCode("28A01")).toBeNull();
  });
});
