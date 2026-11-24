// Importes en céntimos (bigint); cantidades con 3 decimales, precios con 4 y porcentajes con 2.
import { describe, expect, it } from "vitest";
import { calculateInvoice, lineBase, parseInvoiceLine, parseTaxCategory, taxCategoryKey, type InvoiceLine, type TaxCategory } from "../src";

const VAT21: TaxCategory = { kind: "VAT", ratePercent: 2100n };
const VAT10: TaxCategory = { kind: "VAT", ratePercent: 1000n };
const VAT4: TaxCategory = { kind: "VAT", ratePercent: 400n };
const VAT0: TaxCategory = { kind: "VAT", ratePercent: 0n };
const EXEMPT: TaxCategory = { kind: "EXEMPT", cause: "E1" };

/** Precio en euros escrito con punto ("12.3456") → diezmilésimas de euro. */
function priceUnits(price: string): bigint {
  const [whole = "0", fraction = ""] = price.split(".");
  return BigInt(whole + fraction.padEnd(4, "0"));
}

/** Línea de `units` unidades a `price` euros. */
const line = (units: number, price: string, tax: TaxCategory, discountPercent = 0n): InvoiceLine => ({
  quantity: BigInt(Math.round(units * 1000)),
  unitPrice: priceUnits(price),
  discountPercent,
  tax,
});

describe("lineBase", () => {
  it("cantidad × precio, redondeado al céntimo", () => {
    expect(lineBase(line(2, "12.3456", VAT21))).toBe(2469n); // 24,6912 → 24,69
  });

  it("aplica el descuento antes de redondear", () => {
    expect(lineBase(line(2, "12.3456", VAT21, 1000n))).toBe(2222n); // 24,6912 × 0,9 = 22,22208 → 22,22
  });

  it("redondea medio céntimo hacia arriba y, en negativo, hacia abajo (simétrico)", () => {
    expect(lineBase(line(1, "0.005", VAT21))).toBe(1n);
    expect(lineBase(line(-1, "0.005", VAT21))).toBe(-1n);
    expect(lineBase(line(1, "0.0049", VAT21))).toBe(0n);
  });

  it("un descuento del 100 % deja la base a cero", () => {
    expect(lineBase(line(3, "10", VAT21, 10000n))).toBe(0n);
  });
});

describe("calculateInvoice", () => {
  it("agrupa por tipo de IVA y calcula la cuota sobre la base acumulada de cada tipo", () => {
    const totals = calculateInvoice({
      lines: [line(1, "100", VAT21), line(1, "50", VAT21), line(1, "30", VAT10), line(1, "20", EXEMPT)],
      equivalenceSurcharge: false,
      withholdingPercent: 0n,
    });
    expect(totals.lineBases).toEqual([10000n, 5000n, 3000n, 2000n]);
    expect(totals.breakdown).toEqual([
      { key: "VAT:2100", tax: VAT21, base: 15000n, quota: 3150n, surchargePercent: 0n, surchargeQuota: 0n },
      { key: "VAT:1000", tax: VAT10, base: 3000n, quota: 300n, surchargePercent: 0n, surchargeQuota: 0n },
      { key: "EXEMPT:E1", tax: EXEMPT, base: 2000n, quota: 0n, surchargePercent: 0n, surchargeQuota: 0n },
    ]);
    expect(totals).toMatchObject({ taxableBase: 20000n, vatTotal: 3450n, surchargeTotal: 0n, withholdingAmount: 0n, total: 23450n });
  });

  it("redondear por tipo no rebaja la cuota frente a aplicar el tipo a la base (criterio TEAC 26/11/2024)", () => {
    // Por línea serían 3 × round(0,0147) = 0,03 €; sobre la base acumulada 0,21 × 21 % = 0,0441 → 0,04 €.
    const totals = calculateInvoice({ lines: [line(1, "0.07", VAT21), line(1, "0.07", VAT21), line(1, "0.07", VAT21)], equivalenceSurcharge: false, withholdingPercent: 0n });
    expect(totals.vatTotal).toBe(4n);
  });

  it("aplica el recargo de equivalencia que corresponde a cada tipo (5,2 %, 1,4 %, 0,5 %)", () => {
    const totals = calculateInvoice({
      lines: [line(1, "100", VAT21), line(1, "100", VAT10), line(1, "100", VAT4), line(1, "100", VAT0), line(1, "100", EXEMPT)],
      equivalenceSurcharge: true,
      withholdingPercent: 0n,
    });
    expect(totals.breakdown.map(({ key, surchargePercent, surchargeQuota }) => [key, surchargePercent, surchargeQuota])).toEqual([
      ["VAT:2100", 520n, 520n],
      ["VAT:1000", 140n, 140n],
      ["VAT:400", 50n, 50n],
      ["VAT:0", 0n, 0n],
      ["EXEMPT:E1", 0n, 0n],
    ]);
    expect(totals.surchargeTotal).toBe(710n);
    expect(totals.total).toBe(50000n + 2100n + 1000n + 400n + 710n);
  });

  it("descuenta la retención de IRPF sobre la base total", () => {
    const totals = calculateInvoice({ lines: [line(1, "1000", VAT21)], equivalenceSurcharge: false, withholdingPercent: 1500n });
    expect(totals).toMatchObject({ taxableBase: 100000n, vatTotal: 21000n, withholdingAmount: 15000n, total: 106000n });
  });

  it("una rectificación por diferencias produce importes negativos coherentes", () => {
    const totals = calculateInvoice({ lines: [line(-1, "100", VAT21)], equivalenceSurcharge: false, withholdingPercent: 1500n });
    expect(totals).toMatchObject({ taxableBase: -10000n, vatTotal: -2100n, withholdingAmount: -1500n, total: -10600n });
  });

  it("ordena el desglose de mayor a menor tipo, con las exentas al final, sea cual sea el orden de las líneas", () => {
    const totals = calculateInvoice({
      lines: [line(1, "1", EXEMPT), line(1, "1", VAT4), line(1, "1", VAT21), line(1, "1", VAT10)],
      equivalenceSurcharge: false,
      withholdingPercent: 0n,
    });
    expect(totals.breakdown.map((entry) => entry.key)).toEqual(["VAT:2100", "VAT:1000", "VAT:400", "EXEMPT:E1"]);
  });

  it("cada causa de exención es un grupo propio del desglose (un DetalleDesglose por OperacionExenta)", () => {
    const totals = calculateInvoice({
      lines: [line(1, "10", EXEMPT), line(1, "20", { kind: "EXEMPT", cause: "E6" }), line(1, "5", EXEMPT)],
      equivalenceSurcharge: false,
      withholdingPercent: 0n,
    });
    expect(totals.breakdown.map((entry) => [entry.key, entry.base])).toEqual([
      ["EXEMPT:E1", 1500n],
      ["EXEMPT:E6", 2000n],
    ]);
  });

  it("sin líneas, todo es cero", () => {
    expect(calculateInvoice({ lines: [], equivalenceSurcharge: false, withholdingPercent: 0n })).toEqual({
      lineBases: [],
      breakdown: [],
      taxableBase: 0n,
      vatTotal: 0n,
      surchargeTotal: 0n,
      withholdingAmount: 0n,
      total: 0n,
    });
  });
});

describe("claves de categoría (lo que se guarda en la base de datos)", () => {
  it("ida y vuelta de cada tipo admitido", () => {
    for (const key of ["VAT:2100", "VAT:1000", "VAT:400", "VAT:0", "EXEMPT:E1", "EXEMPT:E4", "EXEMPT:E6"]) {
      const tax = parseTaxCategory(key);
      expect(tax === null ? null : taxCategoryKey(tax)).toBe(key);
    }
  });

  it("una exención antigua sin causa se puede leer (cause null) pero no es una causa", () => {
    expect(parseTaxCategory("EXEMPT")).toEqual({ kind: "EXEMPT", cause: null });
    expect(taxCategoryKey({ kind: "EXEMPT", cause: null })).toBe("EXEMPT");
  });

  it("lo demás no es una categoría", () => {
    for (const key of ["VAT:1600", "EXEMPT:E2", "EXEMPT:E5", "EXEMPT:", "exempt", 2100, null]) expect(parseTaxCategory(key)).toBeNull();
  });
});

describe("parseInvoiceLine (formulario)", () => {
  it("convierte los textos del formulario en una línea exacta", () => {
    expect(parseInvoiceLine({ description: " Reparación de caldera ", quantity: "1,5", unitPrice: "40", discountPercent: "", tax: "VAT:2100" })).toEqual({
      ok: true,
      value: { description: "Reparación de caldera", quantity: 1500n, unitPrice: 400000n, discountPercent: 0n, tax: VAT21 },
    });
    expect(parseInvoiceLine({ description: "Servicio exento", quantity: "-2", unitPrice: "10", discountPercent: "5", tax: "EXEMPT:E1" })).toMatchObject({
      ok: true,
      value: { quantity: -2000n, discountPercent: 500n, tax: EXEMPT },
    });
  });

  it("admite los límites: 500 caracteres, descuento del 100 % o en blanco", () => {
    expect(parseInvoiceLine({ description: "x".repeat(500), quantity: "1", unitPrice: "1", discountPercent: "100", tax: "VAT:2100" })).toMatchObject({
      ok: true,
      value: { discountPercent: 10000n },
    });
    expect(parseInvoiceLine({ description: "a", quantity: "1", unitPrice: "1", discountPercent: "  ", tax: "VAT:2100" })).toMatchObject({
      ok: true,
      value: { discountPercent: 0n },
    });
  });

  it("una exención necesita su causa: E1 (art. 20), E4 (arts. 23 y 24) o E6 (otras)", () => {
    expect(parseInvoiceLine({ description: "a", quantity: "1", unitPrice: "1", tax: "EXEMPT:E4" })).toMatchObject({ ok: true, value: { tax: { kind: "EXEMPT", cause: "E4" } } });
    expect(parseInvoiceLine({ description: "a", quantity: "1", unitPrice: "1", tax: "EXEMPT:E6" })).toMatchObject({ ok: true, value: { tax: { kind: "EXEMPT", cause: "E6" } } });
    expect(parseInvoiceLine({ description: "a", quantity: "1", unitPrice: "1", tax: "EXEMPT" })).toEqual({ ok: false, errors: { tax: "Indica la causa de la exención." } });
    // E2, E3 (exportaciones) y E5 (entregas intracomunitarias) exigen clave de régimen o destinatarios que aún no se admiten.
    expect(parseInvoiceLine({ description: "a", quantity: "1", unitPrice: "1", tax: "EXEMPT:E2" })).toEqual({ ok: false, errors: { tax: "Elige un tipo de IVA." } });
  });

  it("una descripción ausente o demasiado larga basta para rechazar la línea", () => {
    expect(parseInvoiceLine({ quantity: "1", unitPrice: "1", tax: "EXEMPT:E1" })).toEqual({ ok: false, errors: { description: "Describe el producto o servicio." } });
    expect(parseInvoiceLine({ description: "x".repeat(501), quantity: "1", unitPrice: "1", tax: "EXEMPT:E1" })).toEqual({
      ok: false,
      errors: { description: "La descripción no puede superar los 500 caracteres." },
    });
  });

  it("explica cada error en español, por campo", () => {
    expect(parseInvoiceLine({ description: "", quantity: "0", unitPrice: "-1", discountPercent: "120", tax: "VAT:1600" })).toEqual({
      ok: false,
      errors: {
        description: "Describe el producto o servicio.",
        quantity: "La cantidad no puede ser cero.",
        unitPrice: "Escribe un precio de 0 o más, con hasta 4 decimales.",
        discountPercent: "El descuento debe estar entre 0 y 100 %.",
        tax: "Elige un tipo de IVA.",
      },
    });
    expect(parseInvoiceLine({ description: "x".repeat(501), quantity: "1,0001", unitPrice: "1", tax: "VAT:2100" })).toEqual({
      ok: false,
      errors: {
        description: "La descripción no puede superar los 500 caracteres.",
        quantity: "Escribe una cantidad con hasta 3 decimales.",
      },
    });
  });
});
