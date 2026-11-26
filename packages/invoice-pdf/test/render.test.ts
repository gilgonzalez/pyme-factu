// PDF de la factura: contenido (RD 1619/2012, art. 6), QR tributario (OM HAC/1177/2024, arts. 20 y 21;
// especificación del QR v0.5.0, apartado 3) y maquetación A4. Se lee el PDF REAL generado. Datos ficticios.
import QRCode from "qrcode";
import { PDFName } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { renderInvoicePdf, type InvoicePdfData, type PdfLine } from "../src";
import { MM, PAGE, readPdf, type ReadPdf, type TextRun } from "./pdf-reader";

// Geometría pactada: márgenes de 15 mm, pie de 12 mm, QR de 35 mm con 6 mm de blanco alrededor.
const MARGIN = 15 * MM;
const WIDTH = PAGE.width - 2 * MARGIN;
const BODY_LIMIT = MARGIN + 12 * MM;
const QR = 35 * MM;
const QUIET = 6 * MM;
const LINE_HEIGHT = 9 * 1.35;
const STRONG_HEIGHT = 11 * 1.35;
const BLACK = "0 0 0";
const GRAY = "0.35 0.35 0.35";
const RED = "0.7 0.1 0.1";
const COLUMN_SHARES = [0.35, 0.09, 0.13, 0.07, 0.21, 0.15];
const columnStart = (index: number): number => MARGIN + COLUMN_SHARES.slice(0, index).reduce((sum, share) => sum + share, 0) * WIDTH;
const columnEnd = (index: number): number => columnStart(index + 1) - 4;

let qrPng: Uint8Array;
beforeAll(async () => {
  qrPng = await QRCode.toBuffer("https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=12345678Z&numserie=F2026-0001&fecha=24-11-2026&importe=121.00", {
    errorCorrectionLevel: "M",
    margin: 0,
  });
});

const LINE: PdfLine = { description: "Reparación de caldera", quantity: "2", unitPrice: "50 €", discount: "10 %", tax: "IVA 21 %", base: "90,00 €" };

const base = (): InvoicePdfData => ({
  title: "Factura F2026-0001",
  issueDate: "24/11/2026",
  issuer: { name: "Ana Ficticia Pérez", nif: "12345678Z", address: "Calle Mayor 1, 28001 Madrid" },
  recipient: { name: "Cliente Ficticio SL", nif: "B12345674", address: "" },
  lines: [LINE, { description: "Asesoramiento", quantity: "1", unitPrice: "20 €", discount: "—", tax: "Exenta (art. 20 LIVA)", base: "20,00 €" }],
  amounts: [
    { label: "IVA 21 % sobre 90,00 €", value: "18,90 €" },
    { label: "Base imponible", value: "110,00 €" },
    { label: "Total", value: "128,90 €", strong: true },
  ],
  notes: null,
  rectification: null,
  annulled: false,
  draft: false,
  verifactu: { qrPng },
  logo: null,
  payment: [],
  legal: [],
});

const render = async (data: InvoicePdfData): Promise<ReadPdf> => readPdf(await renderInvoicePdf(data));

/** El texto `text` de la página `page` (exactamente uno). */
function run(pdf: ReadPdf, text: string, page = 0): TextRun {
  const found = pdf.pages[page]?.runs.filter((candidate) => candidate.text === text) ?? [];
  expect(found, `«${text}» en la página ${String(page + 1)}`).toHaveLength(1);
  return found[0] as TextRun;
}

const bodyRuns = (pdf: ReadPdf, page: number): TextRun[] => (pdf.pages[page]?.runs ?? []).filter((candidate) => !candidate.text.startsWith("Página "));

describe("contenido de la factura", () => {
  it("número, fecha, emisor, destinatario, líneas e importes", async () => {
    const pdf = await render(base());
    expect(pdf.pages).toHaveLength(1);
    const all = pdf.texts.flat();
    for (const expected of [
      "Factura F2026-0001",
      "Fecha de expedición: 24/11/2026",
      "Ana Ficticia Pérez",
      "NIF 12345678Z",
      "Calle Mayor 1, 28001 Madrid",
      "Cliente Ficticio SL",
      "NIF B12345674",
      "Reparación de caldera",
      "Exenta (art. 20 LIVA)",
      "IVA 21 % sobre 90,00 €",
      "128,90 €",
      "Página 1 de 1",
    ]) {
      expect(all).toContain(expected);
    }
    expect(all.some((text) => text.startsWith("Observaciones"))).toBe(false);
    expect(pdf.document.getTitle()).toBe("Factura F2026-0001");
    expect(pdf.document.getProducer()).toBe("FacturaLibre");
    expect(pdf.document.getCreator()).toBe("FacturaLibre");
    expect(pdf.document.catalog.get(PDFName.of("Lang"))?.toString()).toBe("(es-ES)");
    expect(pdf.document.getPages()[0]?.getSize()).toEqual(PAGE);
  });

  it("rectificativa, observaciones y factura anulada", async () => {
    const pdf = await render({
      ...base(),
      title: "Factura rectificativa R2026-0001",
      rectification: "Rectifica la factura F2026-0001 (R1). Motivo: Precio unitario incorrecto",
      notes: "Pago por transferencia.",
      annulled: true,
    });
    const all = pdf.texts.flat();
    expect(all).toContain("Factura rectificativa R2026-0001");
    expect(all).toContain("Rectifica la factura F2026-0001 (R1). Motivo: Precio unitario incorrecto");
    expect(all).toContain("Observaciones: Pago por transferencia.");
    const annulled = run(pdf, "ANULADA: factura expedida por error; consta su registro de anulación VERI*FACTU.");
    expect(annulled).toMatchObject({ bold: true, color: RED, size: 9 });
  });

  it("un borrador avisa de que no es una factura, lleva marca de agua en cada página y no tiene QR", async () => {
    const lines = Array.from({ length: 70 }, (_, index) => ({ ...LINE, description: `Servicio ${String(index + 1)}` }));
    const pdf = await render({ ...base(), title: "Borrador de factura", issueDate: "26/11/2026", draft: true, verifactu: null, lines });
    const banner = run(pdf, "BORRADOR: documento sin validez fiscal. No es una factura: no tiene número ni registro VERI*FACTU.");
    expect(banner).toMatchObject({ bold: true, color: RED, size: 9 });
    expect(banner.y).toBeGreaterThan(run(pdf, "Borrador de factura").y);
    expect(pdf.texts.flat()).toContain("Fecha: 26/11/2026");
    expect(pdf.texts.flat()).not.toContain("Fecha de expedición: 26/11/2026");
    expect(pdf.texts.flat()).not.toContain("Factura emitida antes de VERI*FACTU: sin registro de facturación ni código QR.");
    expect(pdf.pages.flatMap((page) => page.images)).toHaveLength(0);
    expect(pdf.pages.length).toBeGreaterThan(1);
    for (const content of pdf.contents) expect(content).toContain(`<${Buffer.from("BORRADOR", "latin1").toString("hex").toUpperCase()}> Tj`);
  });

  it("una factura no lleva marca de agua de borrador", async () => {
    const pdf = await render(base());
    for (const content of pdf.contents) expect(content).not.toContain(`<${Buffer.from("BORRADOR", "latin1").toString("hex").toUpperCase()}> Tj`);
  });

  it("sin NIF ni domicilio no se escriben líneas vacías; los espacios se normalizan", async () => {
    const pdf = await render({
      ...base(),
      recipient: { name: "Cliente   sin\tNIF ", nif: null, address: "" },
      lines: [{ ...LINE, discount: "" }],
    });
    const all = pdf.texts.flat();
    const recipientTitle = run(pdf, "Destinatario");
    const recipientColumn = (pdf.pages[0]?.runs ?? []).filter((text) => text.x === recipientTitle.x && text.y < recipientTitle.y && text.y > run(pdf, "Descripción").y);
    expect(recipientColumn.map((text) => text.text)).toEqual(["Cliente sin NIF"]);
    expect(all).not.toContain("");
  });

  it("el signo menos tipográfico (retenciones) se escribe como guion, no como «?»", async () => {
    const pdf = await render({ ...base(), amounts: [{ label: "Retención IRPF (15 %)", value: "−15,00 €" }] });
    expect(pdf.texts.flat()).toContain("-15,00 €");
  });

  it("los textos largos se reparten en varias líneas y lo que no se puede escribir no rompe el PDF", async () => {
    const description = `${"palabra ".repeat(60)}→ ✓ fin`;
    const pdf = await render({ ...base(), lines: [{ ...LINE, description }] });
    const fragments = pdf.texts.flat().filter((text) => text.includes("palabra") || text.includes("fin"));
    expect(fragments.length).toBeGreaterThan(3);
    expect(fragments.join(" ")).toBe(`${"palabra ".repeat(60)}? ? fin`);
  });

  it("una palabra más ancha que su columna se corta en trozos que caben", async () => {
    const word = "X".repeat(150);
    const pdf = await render({ ...base(), lines: [{ ...LINE, description: word }] });
    const pieces = (pdf.pages[0]?.runs ?? []).filter((candidate) => /^X+$/.test(candidate.text));
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.map((piece) => piece.text).join("")).toBe(word);
    for (const piece of pieces) expect(piece.x + piece.width).toBeLessThanOrEqual(columnEnd(0) + 0.01);
    // Cada trozo, salvo el último, está lleno: con una letra más ya no cabría.
    for (const piece of pieces.slice(0, -1)) expect(piece.x + pdf.measure(`${piece.text}X`, 9)).toBeGreaterThan(columnEnd(0));
  });

  it("muchas líneas: varias páginas numeradas, con el QR solo en la primera", async () => {
    const lines = Array.from({ length: 70 }, (_, index) => ({ ...LINE, description: `Servicio ${String(index + 1)}` }));
    const pdf = await render({ ...base(), lines });
    const count = pdf.pages.length;
    expect(count).toBeGreaterThan(1);
    expect(pdf.texts.at(-1)).toContain(`Página ${String(count)} de ${String(count)}`);
    expect(pdf.texts.flat()).toContain("Servicio 70");
    expect(pdf.pages[0]?.images).toHaveLength(1);
    expect(pdf.pages.slice(1).flatMap((page) => page.images)).toHaveLength(0);
    expect(pdf.texts.slice(1).flat()).not.toContain("QR tributario:");
  });
});

describe("QR tributario", () => {
  it("al principio, centrado, de 35 mm, con 6 mm de blanco, precedido de «QR tributario:» y seguido de «VERI*FACTU»", async () => {
    const pdf = await render(base());
    expect((pdf.texts[0] ?? []).slice(0, 2)).toEqual(["QR tributario:", "VERI*FACTU"]);
    const [qr] = pdf.pages[0]?.images ?? [];
    const label = run(pdf, "QR tributario:");
    const mark = run(pdf, "VERI*FACTU");
    // Textos en negrita y del tamaño mayor del documento, centrados sobre el QR.
    for (const text of [label, mark]) {
      expect(text).toMatchObject({ bold: true, size: 11, color: BLACK });
      expect(text.x + text.width / 2).toBeCloseTo(PAGE.width / 2, 3);
    }
    expect(label.y).toBeCloseTo(PAGE.height - MARGIN - 11, 3);
    expect(qr?.width).toBeCloseTo(QR, 3);
    expect(qr?.height).toBeCloseTo(QR, 3);
    expect((qr?.x ?? 0) + (qr?.width ?? 0) / 2).toBeCloseTo(PAGE.width / 2, 3);
    expect((qr?.y ?? 0) + QR).toBeCloseTo(PAGE.height - MARGIN - STRONG_HEIGHT - QUIET, 3);
    expect(mark.y + 11).toBeCloseTo((qr?.y ?? 0) - QUIET, 3);
    // Lo siguiente (el título) deja también 6 mm de blanco bajo «VERI*FACTU».
    expect(run(pdf, "Factura F2026-0001").y + 11).toBeCloseTo(mark.y + 11 - STRONG_HEIGHT - QUIET, 3);
  });

  it("una factura sin registro (anterior a VERI*FACTU) no lleva QR y lo dice", async () => {
    const pdf = await render({ ...base(), verifactu: null });
    expect(pdf.pages[0]?.images).toHaveLength(0);
    expect(pdf.texts.flat()).not.toContain("QR tributario:");
    expect(run(pdf, "Factura emitida antes de VERI*FACTU: sin registro de facturación ni código QR.")).toMatchObject({ bold: false, color: GRAY, size: 9 });
    expect(run(pdf, "Factura F2026-0001").y).toBeCloseTo(PAGE.height - MARGIN - 11, 3);
  });
});

describe("maquetación", () => {
  it("de arriba abajo, cada bloque en su sitio y con su separación", async () => {
    const pdf = await render({
      ...base(),
      annulled: true,
      rectification: "Rectifica la factura F2026-0001 (R1). Motivo: Precio",
      notes: "Pago por transferencia.",
      verifactu: null,
    });
    const top = (text: string): number => {
      const found = run(pdf, text);
      return found.y + found.size;
    };
    const steps: [string, string, number][] = [
      ["ANULADA: factura expedida por error; consta su registro de anulación VERI*FACTU.", "Factura F2026-0001", LINE_HEIGHT + 4],
      ["Factura F2026-0001", "Fecha de expedición: 24/11/2026", STRONG_HEIGHT],
      ["Fecha de expedición: 24/11/2026", "Emisor", LINE_HEIGHT + 4 * MM],
      ["Emisor", "Rectifica la factura F2026-0001 (R1). Motivo: Precio", 4 * LINE_HEIGHT + 4 * MM],
      ["Rectifica la factura F2026-0001 (R1). Motivo: Precio", "Descripción", LINE_HEIGHT + 4 * MM],
      ["Descripción", "Reparación de caldera", LINE_HEIGHT + 2],
      ["Asesoramiento", "IVA 21 % sobre 90,00 €", LINE_HEIGHT + 2 + 3 * MM],
      ["Total", "Observaciones: Pago por transferencia.", STRONG_HEIGHT + 4 * MM],
      ["Observaciones: Pago por transferencia.", "Factura emitida antes de VERI*FACTU: sin registro de facturación ni código QR.", LINE_HEIGHT + 4 * MM],
    ];
    expect(top(steps[0]?.[0] ?? "")).toBeCloseTo(PAGE.height - MARGIN, 3);
    for (const [above, below, distance] of steps) expect(top(above) - top(below), `de «${above}» a «${below}»`).toBeCloseTo(distance, 3);
  });

  it("una etiqueta de importe larga se reparte sin invadir la columna del importe", async () => {
    const label = "Recargo de equivalencia aplicable a la entrega de bienes al comerciante minorista";
    const pdf = await render({ ...base(), amounts: [{ label, value: "1,00 €" }] });
    const pieces = (pdf.pages[0]?.runs ?? []).filter((text) => text.x === MARGIN + WIDTH * 0.4);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.map((text) => text.text).join(" ")).toBe(label);
    for (const piece of pieces) expect(piece.x + piece.width).toBeLessThanOrEqual(MARGIN + WIDTH * 0.8 - 4);
    expect(pieces[0]?.x).toBeCloseTo(MARGIN + WIDTH * 0.4, 3);
    expect(Math.max(...pieces.map((text) => text.x + text.width))).toBeGreaterThan(MARGIN + WIDTH * 0.8 - 4 - pdf.measure(" Recargo", 9));
  });

  it("la etiqueta deja 4 puntos de separación con el importe", async () => {
    const limit = WIDTH * 0.4 - 4;
    // Una etiqueta que se pasa del límite por menos de esos 4 puntos: ya no cabe en una línea.
    const measure = (await render(base())).measure;
    let label = "i";
    while (measure(`${label} i`, 9) <= limit) label += " i";
    label += " i";
    expect(measure(label, 9)).toBeLessThanOrEqual(limit + 8);
    const pdf = await render({ ...base(), amounts: [{ label, value: "1,00 €" }] });
    expect((pdf.pages[0]?.runs ?? []).filter((text) => text.x === MARGIN + WIDTH * 0.4)).toHaveLength(2);
  });

  it("todo el texto queda dentro de los márgenes, en negro salvo los avisos", async () => {
    const pdf = await render({ ...base(), notes: "Pago por transferencia." });
    for (const text of bodyRuns(pdf, 0)) {
      expect(text.x).toBeGreaterThanOrEqual(MARGIN - 0.01);
      expect(text.x + text.width).toBeLessThanOrEqual(PAGE.width - MARGIN + 0.01);
      expect(text.y).toBeGreaterThanOrEqual(BODY_LIMIT);
      expect(text.color).toBe(BLACK);
    }
    expect(run(pdf, "Observaciones: Pago por transferencia.")).toMatchObject({ x: MARGIN, bold: false, size: 9 });
  });

  it("cabecera: título en negrita y grande; fecha debajo, en texto normal", async () => {
    const pdf = await render(base());
    const title = run(pdf, "Factura F2026-0001");
    const date = run(pdf, "Fecha de expedición: 24/11/2026");
    expect(title).toMatchObject({ x: MARGIN, bold: true, size: 11 });
    expect(date).toMatchObject({ x: MARGIN, bold: false, size: 9 });
    expect(date.y + 9).toBeCloseTo(title.y + 11 - STRONG_HEIGHT, 3);
  });

  it("emisor a la izquierda y destinatario a la derecha, con sus datos línea a línea", async () => {
    const pdf = await render(base());
    const half = (WIDTH - 8) / 2;
    const issuerTitle = run(pdf, "Emisor");
    const recipientTitle = run(pdf, "Destinatario");
    expect(issuerTitle).toMatchObject({ x: MARGIN, bold: true });
    expect(recipientTitle).toMatchObject({ x: MARGIN + half + 8, bold: true, y: issuerTitle.y });
    const issuer = ["Ana Ficticia Pérez", "NIF 12345678Z", "Calle Mayor 1, 28001 Madrid"].map((text) => run(pdf, text));
    issuer.forEach((text, index) => {
      expect(text).toMatchObject({ x: MARGIN, bold: false, size: 9 });
      expect(text.y).toBeCloseTo(issuerTitle.y - LINE_HEIGHT * (index + 1), 3);
    });
    expect(run(pdf, "NIF B12345674")).toMatchObject({ x: MARGIN + half + 8, y: issuer[1]?.y });
    // El bloque ocupa lo que la parte más larga (3 líneas): lo siguiente empieza debajo.
    const header = run(pdf, "Descripción");
    expect(header.y).toBeLessThan((issuer[2]?.y ?? 0) - LINE_HEIGHT);
  });

  it("tabla de líneas: cabecera en negrita, importes alineados a la derecha de su columna", async () => {
    const pdf = await render(base());
    const headers = ["Descripción", "Cantidad", "Precio", "Dto.", "IVA", "Base"].map((text) => run(pdf, text));
    for (const header of headers) expect(header).toMatchObject({ bold: true, size: 9, y: headers[0]?.y });
    const cells = [LINE.description, LINE.quantity, LINE.unitPrice, LINE.discount, LINE.tax, LINE.base].map((text) => run(pdf, text));
    const rightAligned = [1, 2, 3, 5];
    cells.forEach((cell, index) => {
      expect(cell).toMatchObject({ bold: false, size: 9, y: cells[0]?.y });
      if (rightAligned.includes(index)) expect(cell.x + cell.width).toBeCloseTo(columnEnd(index), 3);
      else expect(cell.x).toBeCloseTo(columnStart(index), 3);
    });
    expect(cells[0]?.y).toBeCloseTo((headers[0]?.y ?? 0) - LINE_HEIGHT - 2, 3);
    // La segunda línea, 2 puntos por debajo de la primera.
    expect(run(pdf, "Asesoramiento").y).toBeCloseTo((cells[0]?.y ?? 0) - LINE_HEIGHT - 2, 3);
  });

  it("una línea que ocupa varios renglones empuja a la siguiente", async () => {
    const description = "palabra ".repeat(20).trim();
    const pdf = await render({ ...base(), lines: [{ ...LINE, description }, { ...LINE, description: "Siguiente", base: "1,00 €" }] });
    const pieces = (pdf.pages[0]?.runs ?? []).filter((candidate) => candidate.text.startsWith("palabra"));
    expect(pieces.length).toBeGreaterThan(1);
    pieces.forEach((piece, index) => { expect(piece.y).toBeCloseTo((pieces[0]?.y ?? 0) - index * LINE_HEIGHT, 3); });
    expect(run(pdf, "Siguiente").y).toBeCloseTo((pieces[0]?.y ?? 0) - pieces.length * LINE_HEIGHT - 2, 3);
    expect(run(pdf, "90,00 €").y).toBe(pieces[0]?.y);
  });

  it("importes a la derecha; el total, en negrita y grande", async () => {
    const pdf = await render(base());
    const label = run(pdf, "Base imponible");
    const value = run(pdf, "110,00 €");
    expect(label).toMatchObject({ x: MARGIN + WIDTH * 0.4, bold: false, size: 9 });
    expect(value).toMatchObject({ bold: false, size: 9, y: label.y });
    expect(value.x + value.width).toBeCloseTo(MARGIN + WIDTH, 3);
    const total = run(pdf, "128,90 €");
    expect(run(pdf, "Total")).toMatchObject({ bold: true, size: 11, y: total.y });
    expect(total).toMatchObject({ bold: true, size: 11 });
    expect(total.x + total.width).toBeCloseTo(MARGIN + WIDTH, 3);
    expect(total.y + 11).toBeCloseTo(label.y + 9 - LINE_HEIGHT, 3);
  });

  it("pie de cada página: «Página i de n», centrado, pequeño y en gris", async () => {
    const lines = Array.from({ length: 70 }, (_, index) => ({ ...LINE, description: `Servicio ${String(index + 1)}` }));
    const pdf = await render({ ...base(), lines });
    pdf.pages.forEach((_, index) => {
      const footer = run(pdf, `Página ${String(index + 1)} de ${String(pdf.pages.length)}`, index);
      expect(footer).toMatchObject({ size: 8, color: GRAY, bold: false, y: MARGIN / 2 });
      expect(footer.x + footer.width / 2).toBeCloseTo(PAGE.width / 2, 3);
    });
  });

  it("salto de página: se llena hasta el pie y la página siguiente empieza arriba", async () => {
    const lines = Array.from({ length: 70 }, (_, index) => ({ ...LINE, description: `Servicio ${String(index + 1)}` }));
    const pdf = await render({ ...base(), lines });
    const lowest = Math.min(...bodyRuns(pdf, 0).map((text) => text.y));
    expect(lowest).toBeGreaterThanOrEqual(BODY_LIMIT);
    expect(lowest).toBeLessThan(BODY_LIMIT + 2 * (LINE_HEIGHT + 2));
    const [first] = bodyRuns(pdf, 1);
    expect(first?.y).toBeCloseTo(PAGE.height - MARGIN - 9, 3);
    // Una fila nunca se parte entre páginas: sus celdas comparten línea base.
    expect(bodyRuns(pdf, 1).filter((text) => text.y === first?.y)).toHaveLength(6);
  });
});

describe("datos de la empresa", () => {
  it("el contacto del emisor va bajo su domicilio", async () => {
    const pdf = await render({ ...base(), issuer: { ...base().issuer, details: ["Tel. 600 123 456", "hola@fontaneria.example", "fontaneria.example"] } });
    const issuerColumn = (pdf.pages[0]?.runs ?? []).filter((text) => text.x === run(pdf, "Emisor").x && text.y < run(pdf, "Emisor").y && text.y > run(pdf, "Descripción").y);
    expect(issuerColumn.map((text) => text.text)).toEqual([
      "Ana Ficticia Pérez",
      "NIF 12345678Z",
      "Calle Mayor 1, 28001 Madrid",
      "Tel. 600 123 456",
      "hola@fontaneria.example",
      "fontaneria.example",
    ]);
  });

  it("el logo va arriba a la derecha, junto al título, sin pasar de 50 × 20 mm ni deformarse", async () => {
    const pdf = await render({ ...base(), verifactu: null, logo: { bytes: qrPng, kind: "png" } });
    const [logo] = pdf.pages[0]?.images ?? [];
    expect(pdf.pages[0]?.images).toHaveLength(1);
    // El QR de prueba es cuadrado: lo limita el alto (20 mm).
    expect(logo?.height).toBeCloseTo(20 * MM, 3);
    expect(logo?.width).toBeCloseTo(20 * MM, 3);
    expect((logo?.x ?? 0) + (logo?.width ?? 0)).toBeCloseTo(PAGE.width - MARGIN, 3);
    expect((logo?.y ?? 0) + (logo?.height ?? 0)).toBeCloseTo(PAGE.height - MARGIN, 3);
    // Lo que sigue al título empieza por debajo del logo.
    expect(run(pdf, "Emisor").y + 9).toBeLessThan(logo?.y ?? 0);
  });

  it("con QR tributario, el logo va después de él (el QR siempre es lo primero)", async () => {
    const pdf = await render({ ...base(), logo: { bytes: qrPng, kind: "png" } });
    const [qr, logo] = pdf.pages[0]?.images ?? [];
    expect(pdf.pages[0]?.images).toHaveLength(2);
    expect(logo?.y ?? 0).toBeLessThan(qr?.y ?? 0);
  });

  it("forma de pago tras los importes y textos legales al final, en gris", async () => {
    const pdf = await render({
      ...base(),
      notes: "Pago por transferencia.",
      verifactu: null,
      payment: ["Transferencia a ES91 2100 0418 4502 0005 1332", "Vencimiento: 24/12/2026"],
      legal: ["Inscrita en el Registro Mercantil de Madrid, tomo 1, folio 2, hoja M-3", "Gracias por su confianza."],
    });
    const title = run(pdf, "Forma de pago");
    expect(title).toMatchObject({ bold: true, size: 9 });
    expect(title.y).toBeLessThan(run(pdf, "128,90 €").y);
    expect(run(pdf, "Transferencia a ES91 2100 0418 4502 0005 1332").y).toBeLessThan(title.y);
    expect(run(pdf, "Vencimiento: 24/12/2026").y).toBeLessThan(title.y);
    const registry = run(pdf, "Inscrita en el Registro Mercantil de Madrid, tomo 1, folio 2, hoja M-3");
    expect(registry).toMatchObject({ color: GRAY, size: 8 });
    expect(registry.y).toBeLessThan(run(pdf, "Observaciones: Pago por transferencia.").y);
    expect(run(pdf, "Gracias por su confianza.").y).toBeLessThan(registry.y);
  });
});
