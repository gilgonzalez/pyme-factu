// PDF de la factura (A4). Contenido según el RD 1619/2012, art. 6; QR tributario según la OM HAC/1177/2024
// (arts. 20 y 21) y la especificación del QR v0.5.0 (apartado 3): al principio de la factura, centrado, de 35 mm,
// con 6 mm de margen en blanco, precedido de «QR tributario:» y seguido de «VERI*FACTU», solo en la primera
// página y con letra no menor que la del resto de datos. Recibe los datos ya formateados (importes, fechas).
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";

export interface PdfParty {
  readonly name: string;
  readonly nif: string | null;
  readonly address: string;
}

export interface PdfLine {
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly discount: string;
  readonly tax: string;
  readonly base: string;
}

export interface PdfAmount {
  readonly label: string;
  readonly value: string;
  readonly strong?: boolean;
}

export interface InvoicePdfData {
  /** «Factura F2026-0001» o «Factura rectificativa R2026-0001». */
  readonly title: string;
  readonly issueDate: string;
  readonly issuer: PdfParty;
  readonly recipient: PdfParty;
  readonly lines: readonly PdfLine[];
  /** Desglose y totales, en orden. */
  readonly amounts: readonly PdfAmount[];
  readonly notes: string | null;
  /** Frase que identifica la factura rectificada y el motivo, si es rectificativa. */
  readonly rectification: string | null;
  readonly annulled: boolean;
  /** PNG del QR (nivel M); null si la factura no tiene registro VERI*FACTU. */
  readonly verifactu: { readonly qrPng: Uint8Array } | null;
}

const MM = 72 / 25.4;
const PAGE: [number, number] = [595.28, 841.89];
const MARGIN = 15 * MM;
const FOOTER = 12 * MM;
const WIDTH = PAGE[0] - 2 * MARGIN;
const QR_SIZE = 35 * MM;
const QR_QUIET = 6 * MM;
const BODY = 9;
/** Título, total y textos del QR: el tamaño mayor del documento. */
const STRONG = 11;
const LEADING = 1.35;
const CELL_GAP = 4;
const GRAY = rgb(0.35, 0.35, 0.35);
const RED = rgb(0.7, 0.1, 0.1);
const BLACK = rgb(0, 0, 0);

type Align = "left" | "right" | "center";

interface Cell {
  readonly paragraphs: readonly string[];
  readonly x: number;
  readonly width: number;
  readonly align?: Align;
  readonly bold?: boolean;
}

interface WriteOptions {
  readonly bold?: boolean;
  readonly size?: number;
  readonly align?: Align;
  readonly color?: RGB;
}

/** Sustituye por «?» lo que la fuente estándar (WinAnsi) no puede escribir; espacios normalizados. */
function clean(text: string, font: PDFFont): string {
  const supported = new Set(font.getCharacterSet());
  let result = "";
  for (const char of text.replace(/\s+/g, " ").trim()) result += supported.has(char.codePointAt(0) ?? 0) ? char : "?";
  return result;
}

/** Parte una palabra que no cabe en el ancho en trozos que sí caben (toda columna admite al menos un carácter). */
function breakWord(word: string, font: PDFFont, size: number, width: number): string[] {
  const pieces: string[] = [];
  let piece = "";
  for (const char of word) {
    // Stryker disable next-line EqualityOperator: medir exactamente el ancho de la columna no ocurre con estas fuentes (equivalente).
    if (font.widthOfTextAtSize(piece + char, size) > width) {
      pieces.push(piece);
      piece = char;
    } else {
      piece += char;
    }
  }
  return [...pieces, piece];
}

/** Líneas de `text` que caben en `width`. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ").flatMap((candidate) => breakWord(candidate, font, size, width))) {
    const joined = current === "" ? word : `${current} ${word}`;
    // Stryker disable next-line EqualityOperator: medir exactamente el ancho de la columna no ocurre con estas fuentes (equivalente).
    if (font.widthOfTextAtSize(joined, size) <= width) {
      current = joined;
    } else {
      lines.push(current);
      current = word;
    }
  }
  return current === "" ? lines : [...lines, current];
}

function alignedX(align: Align, x: number, width: number, textWidth: number): number {
  if (align === "right") return x + width - textWidth;
  return align === "center" ? x + (width - textWidth) / 2 : x;
}

/** Cursor de escritura de arriba abajo, con salto de página automático. */
class Layout {
  readonly pages: PDFPage[] = [];
  private page: PDFPage;
  private y = PAGE[1] - MARGIN;

  constructor(
    private readonly document: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.page = this.addPage();
  }

  private addPage(): PDFPage {
    const page = this.document.addPage(PAGE);
    this.pages.push(page);
    return page;
  }

  /** Garantiza `height` puntos libres en la página actual; si no, empieza otra. */
  private room(height: number): void {
    // Stryker disable next-line EqualityOperator: acabar exactamente en el límite del pie no ocurre con estas medidas (equivalente).
    if (this.y - height >= MARGIN + FOOTER) return;
    this.page = this.addPage();
    this.y = PAGE[1] - MARGIN;
  }

  gap(points: number): void {
    this.y -= points;
  }

  /** Fila de celdas (columnas) que avanzan juntas: alto = el de la celda más alta. */
  row(cells: readonly Cell[], size = BODY, color: RGB = BLACK): void {
    const lineHeight = size * LEADING;
    const laid = cells.map((cell) => {
      const font = cell.bold === true ? this.bold : this.regular;
      const lines = cell.paragraphs.flatMap((paragraph) => wrap(clean(paragraph, font), font, size, cell.width));
      return { cell, font, lines };
    });
    const height = Math.max(1, ...laid.map(({ lines }) => lines.length)) * lineHeight;
    this.room(height);
    for (const { cell, font, lines } of laid) {
      lines.forEach((line, index) => {
        const x = alignedX(cell.align ?? "left", cell.x, cell.width, font.widthOfTextAtSize(line, size));
        this.page.drawText(line, { x, y: this.y - size - index * lineHeight, size, font, color });
      });
    }
    this.y -= height;
  }

  /** Un texto a todo el ancho. */
  write(text: string, options: WriteOptions = {}): void {
    this.row([{ paragraphs: [text], x: MARGIN, width: WIDTH, align: options.align ?? "left", bold: options.bold ?? false }], options.size ?? BODY, options.color ?? BLACK);
  }

  /** Imagen cuadrada centrada: el QR, lo primero de la primera página (siempre cabe). */
  centeredImage(image: PDFImage, size: number): void {
    this.page.drawImage(image, { x: (PAGE[0] - size) / 2, y: this.y - size, width: size, height: size });
    this.y -= size;
  }

  /** «Página i de n» al pie de cada página. */
  numberPages(): void {
    this.pages.forEach((page, index) => {
      const text = `Página ${String(index + 1)} de ${String(this.pages.length)}`;
      const width = this.regular.widthOfTextAtSize(text, 8);
      page.drawText(text, { x: (PAGE[0] - width) / 2, y: MARGIN / 2, size: 8, font: this.regular, color: GRAY });
    });
  }
}

async function drawQr(layout: Layout, document: PDFDocument, qrPng: Uint8Array): Promise<void> {
  layout.write("QR tributario:", { bold: true, size: STRONG, align: "center" });
  layout.gap(QR_QUIET);
  layout.centeredImage(await document.embedPng(qrPng), QR_SIZE);
  layout.gap(QR_QUIET);
  layout.write("VERI*FACTU", { bold: true, size: STRONG, align: "center" });
  layout.gap(QR_QUIET);
}

/** Nombre, NIF y domicilio; lo que falta queda vacío y un párrafo vacío no ocupa línea. */
const partyParagraphs = (party: PdfParty): string[] => [party.name, party.nif === null ? "" : `NIF ${party.nif}`, party.address];

function drawParties(layout: Layout, data: InvoicePdfData): void {
  const half = (WIDTH - CELL_GAP * 2) / 2;
  const right = MARGIN + half + CELL_GAP * 2;
  layout.row([
    { paragraphs: ["Emisor"], x: MARGIN, width: half, bold: true },
    { paragraphs: ["Destinatario"], x: right, width: half, bold: true },
  ]);
  layout.row([
    { paragraphs: partyParagraphs(data.issuer), x: MARGIN, width: half },
    { paragraphs: partyParagraphs(data.recipient), x: right, width: half },
  ]);
}

const COLUMNS: readonly { readonly key: keyof PdfLine; readonly title: string; readonly share: number; readonly align: Align }[] = [
  { key: "description", title: "Descripción", share: 0.35, align: "left" },
  { key: "quantity", title: "Cantidad", share: 0.09, align: "right" },
  { key: "unitPrice", title: "Precio", share: 0.13, align: "right" },
  { key: "discount", title: "Dto.", share: 0.07, align: "right" },
  { key: "tax", title: "IVA", share: 0.21, align: "left" },
  { key: "base", title: "Base", share: 0.15, align: "right" },
];

function tableCells(texts: (column: (typeof COLUMNS)[number]) => string, bold: boolean): Cell[] {
  let x = MARGIN;
  return COLUMNS.map((column) => {
    const width = column.share * WIDTH;
    const cell = { paragraphs: [texts(column)], x, width: width - CELL_GAP, align: column.align, bold };
    x += width;
    return cell;
  });
}

function drawLines(layout: Layout, lines: readonly PdfLine[]): void {
  layout.row(tableCells((column) => column.title, true));
  layout.gap(2);
  for (const line of lines) {
    layout.row(tableCells((column) => line[column.key], false));
    layout.gap(2);
  }
}

function drawAmounts(layout: Layout, amounts: readonly PdfAmount[]): void {
  const labelX = MARGIN + WIDTH * 0.4;
  for (const amount of amounts) {
    const strong = amount.strong === true;
    layout.row(
      [
        { paragraphs: [amount.label], x: labelX, width: WIDTH * 0.4 - CELL_GAP, bold: strong },
        { paragraphs: [amount.value], x: MARGIN + WIDTH * 0.8, width: WIDTH * 0.2, align: "right", bold: strong },
      ],
      strong ? STRONG : BODY,
    );
  }
}

function drawHeading(layout: Layout, data: InvoicePdfData): void {
  if (data.annulled) {
    layout.write("ANULADA: factura expedida por error; consta su registro de anulación VERI*FACTU.", { bold: true, color: RED });
    layout.gap(4);
  }
  layout.write(data.title, { bold: true, size: STRONG });
  layout.write(`Fecha de expedición: ${data.issueDate}`);
  layout.gap(4 * MM);
}

function drawClosing(layout: Layout, data: InvoicePdfData): void {
  if (data.notes !== null) {
    layout.gap(4 * MM);
    layout.write(`Observaciones: ${data.notes}`);
  }
  if (data.verifactu === null) {
    layout.gap(4 * MM);
    layout.write("Factura emitida antes de VERI*FACTU: sin registro de facturación ni código QR.", { color: GRAY });
  }
}

/** PDF de la factura (bytes). */
export async function renderInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(data.title);
  document.setLanguage("es-ES");
  document.setProducer("FacturaLibre");
  document.setCreator("FacturaLibre");
  const layout = new Layout(document, await document.embedFont(StandardFonts.Helvetica), await document.embedFont(StandardFonts.HelveticaBold));

  if (data.verifactu !== null) await drawQr(layout, document, data.verifactu.qrPng);
  drawHeading(layout, data);
  drawParties(layout, data);
  if (data.rectification !== null) {
    layout.gap(4 * MM);
    layout.write(data.rectification);
  }
  layout.gap(4 * MM);
  drawLines(layout, data.lines);
  layout.gap(3 * MM);
  drawAmounts(layout, data.amounts);
  drawClosing(layout, data);
  layout.numberPages();
  return document.save();
}
