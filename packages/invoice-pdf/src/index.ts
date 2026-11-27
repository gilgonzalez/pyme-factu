// PDF de la factura (A4). Contenido según el RD 1619/2012, art. 6; QR tributario según la OM HAC/1177/2024
// (arts. 20 y 21) y la especificación del QR v0.5.0 (apartado 3): al principio de la factura, centrado, de 35 mm,
// con 6 mm de margen en blanco, precedido de «QR tributario:» y seguido de «VERI*FACTU», solo en la primera
// página y con letra no menor que la del resto de datos. Recibe los datos ya formateados (importes, fechas).
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";

export interface PdfParty {
  readonly name: string;
  readonly nif: string | null;
  readonly address: string;
  /** Líneas de contacto bajo el domicilio (teléfono, email, web). */
  readonly details?: readonly string[];
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
  /** «Factura F2026-0001», «Factura rectificativa R2026-0001» o «Borrador de factura». */
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
  /** Borrador para enseñar al cliente: sin número ni validez fiscal; se avisa y lleva marca de agua. */
  readonly draft: boolean;
  /** Vista previa de un borrador: como la factura real, sin marca de agua, con una nota legal al final. */
  readonly preview?: boolean;
  /** PNG del QR (nivel M); null si la factura no tiene registro VERI*FACTU. */
  readonly verifactu: { readonly qrPng: Uint8Array } | null;
  /** Logo del emisor, arriba a la derecha junto al título (después del QR, que siempre va primero). */
  readonly logo: { readonly bytes: Uint8Array; readonly kind: "png" | "jpeg" } | null;
  /** Forma de pago, vencimiento… (vacío: no se imprime el bloque). */
  readonly payment: readonly string[];
  /** Textos legales al final (datos registrales, pie de factura), en gris. */
  readonly legal: readonly string[];
}

const MM = 72 / 25.4;
const PAGE: [number, number] = [595.28, 841.89];
const MARGIN = 15 * MM;
const FOOTER = 12 * MM;
const WIDTH = PAGE[0] - 2 * MARGIN;
const QR_SIZE = 35 * MM;
const QR_QUIET = 6 * MM;
const LOGO_MAX = { width: 50 * MM, height: 20 * MM };
const SMALL = 8;
const BODY = 9;
/** Título, total y textos del QR: el tamaño mayor del documento. */
const STRONG = 11;
const LEADING = 1.35;
const CELL_GAP = 4;
const GRAY = rgb(0.35, 0.35, 0.35);
const RED = rgb(0.7, 0.1, 0.1);
const BLACK = rgb(0, 0, 0);
const WATERMARK = rgb(0.85, 0.85, 0.85);
/** Tinta de la cabecera de la tabla, separadores finos y acento (el violeta de la aplicación). */
const INK = rgb(0.082, 0.082, 0.11);
const WHITE = rgb(1, 1, 1);
const HAIRLINE = rgb(0.88, 0.88, 0.91);
const ACCENT = rgb(0.353, 0.247, 0.949);
const ACCENT_SOFT = rgb(0.945, 0.933, 0.996);
const TITLE = 16;
const CELL_PADDING = 4;
/** Las bandas y separadores de la tabla sobresalen un poco del texto, que nunca toca sus bordes. */
const BLEED = 6;
/** Sangría de la columna del IVA, para separarla de la del descuento (alineada a la derecha). */
const TAX_INDENT = 10;
const PREVIEW_NOTICE =
  "Vista previa sin validez legal. Este documento es una simulación y no constituye una factura a efectos del Reglamento de facturación (Real Decreto 1619/2012): no ha sido expedido, carece de número de serie y de registro de facturación VERI*FACTU, y no produce efectos fiscales ni mercantiles. La factura definitiva se expedirá con su numeración correlativa, su fecha de expedición y su código QR tributario.";
const DRAFT_NOTICE = "BORRADOR: documento sin validez fiscal. No es una factura: no tiene número ni registro VERI*FACTU.";

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
  /** Ancho disponible (por defecto, todo el de la página). */
  readonly width?: number;
}

/**
 * Sustituye por «?» lo que la fuente estándar (WinAnsi) no puede escribir; espacios normalizados. El signo menos
 * (U+2212, el de las retenciones) no existe en WinAnsi: se escribe como guion.
 */
function clean(text: string, font: PDFFont): string {
  const supported = new Set(font.getCharacterSet());
  let result = "";
  for (const char of text.replace(/\s+/g, " ").replace(/−/g, "-").trim()) result += supported.has(char.codePointAt(0) ?? 0) ? char : "?";
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

  /** Banda de color a todo el ancho de `height` puntos desde el cursor (sin moverlo); empieza página si no cabe. */
  band(height: number, color: RGB, from = MARGIN, width = WIDTH): void {
    this.room(height);
    this.page.drawRectangle({ x: from, y: this.y - height, width, height, color });
  }

  /** Línea horizontal fina en el cursor. */
  rule(color: RGB = HAIRLINE, thickness = 0.6, from = MARGIN, width = WIDTH): void {
    this.page.drawLine({ start: { x: from, y: this.y }, end: { x: from + width, y: this.y }, thickness, color });
  }

  /** Un texto a todo el ancho. */
  write(text: string, options: WriteOptions = {}): void {
    this.row([{ paragraphs: [text], x: MARGIN, width: options.width ?? WIDTH, align: options.align ?? "left", bold: options.bold ?? false }], options.size ?? BODY, options.color ?? BLACK);
  }

  /** Imagen cuadrada centrada: el QR, lo primero de la primera página (siempre cabe). */
  centeredImage(image: PDFImage, size: number): void {
    this.page.drawImage(image, { x: (PAGE[0] - size) / 2, y: this.y - size, width: size, height: size });
    this.y -= size;
  }

  /** Imagen arriba a la derecha que cabe en `max` sin deformarse; no mueve el cursor. Devuelve su caja. */
  imageTopRight(image: PDFImage, max: { readonly width: number; readonly height: number }): { readonly width: number; readonly bottom: number } {
    const scale = Math.min(max.width / image.width, max.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    this.page.drawImage(image, { x: PAGE[0] - MARGIN - width, y: this.y - height, width, height });
    return { width, bottom: this.y - height };
  }

  /** Lleva el cursor al menos hasta `y` (para seguir por debajo de una imagen). */
  below(y: number): void {
    this.y = Math.min(this.y, y);
  }

  /** «BORRADOR» en diagonal, de fondo, en cada página. */
  watermark(text: string): void {
    const size = 110;
    const width = this.bold.widthOfTextAtSize(text, size);
    const angle = 45;
    const radians = (angle * Math.PI) / 180;
    // Centrado en la página: se retrocede medio ancho a lo largo de la diagonal.
    const x = PAGE[0] / 2 - (Math.cos(radians) * width) / 2 + (Math.sin(radians) * size) / 3;
    const y = PAGE[1] / 2 - (Math.sin(radians) * width) / 2 - (Math.cos(radians) * size) / 3;
    for (const page of this.pages) page.drawText(text, { x, y, size, font: this.bold, color: WATERMARK, rotate: degrees(angle), opacity: 0.5 });
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
const partyParagraphs = (party: PdfParty): string[] => [party.name, party.nif === null ? "" : `NIF ${party.nif}`, party.address, ...(party.details ?? [])];

function drawParties(layout: Layout, data: InvoicePdfData): void {
  const half = (WIDTH - CELL_GAP * 2) / 2;
  const right = MARGIN + half + CELL_GAP * 2;
  layout.row(
    [
      { paragraphs: ["Emisor"], x: MARGIN, width: half, bold: true },
      { paragraphs: ["Destinatario"], x: right, width: half, bold: true },
    ],
    SMALL,
    GRAY,
  );
  layout.gap(2);
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
    const indent = column.key === "tax" ? TAX_INDENT : 0;
    const cell = { paragraphs: [texts(column)], x: x + indent, width: width - CELL_GAP - indent, align: column.align, bold };
    x += width;
    return cell;
  });
}

function drawLines(layout: Layout, lines: readonly PdfLine[]): void {
  layout.band(BODY * LEADING + CELL_PADDING * 2, INK, MARGIN - BLEED, WIDTH + BLEED * 2);
  layout.gap(CELL_PADDING);
  layout.row(tableCells((column) => column.title, true), BODY, WHITE);
  layout.gap(CELL_PADDING);
  for (const line of lines) {
    layout.gap(CELL_PADDING);
    layout.row(tableCells((column) => line[column.key], false));
    layout.gap(CELL_PADDING);
    layout.rule(HAIRLINE, 0.6, MARGIN - BLEED, WIDTH + BLEED * 2);
  }
}

function drawAmounts(layout: Layout, amounts: readonly PdfAmount[]): void {
  const labelX = MARGIN + WIDTH * 0.4;
  for (const amount of amounts) {
    const strong = amount.strong === true;
    if (strong) {
      // El total, sobre un fondo suave del acento y separado por una línea.
      layout.gap(CELL_PADDING);
      layout.rule(INK, 0.8, labelX - BLEED, WIDTH * 0.6 + BLEED * 2);
      layout.gap(CELL_PADDING);
      layout.band(STRONG * LEADING + CELL_PADDING * 2, ACCENT_SOFT, labelX - BLEED, WIDTH * 0.6 + BLEED * 2);
      layout.gap(CELL_PADDING);
    }
    layout.row(
      [
        { paragraphs: [amount.label], x: labelX, width: WIDTH * 0.4 - CELL_GAP, bold: strong },
        { paragraphs: [amount.value], x: MARGIN + WIDTH * 0.8, width: WIDTH * 0.2, align: "right", bold: strong },
      ],
      strong ? STRONG : BODY,
    );
    if (strong) layout.gap(CELL_PADDING);
  }
}

async function drawLogo(layout: Layout, document: PDFDocument, logo: InvoicePdfData["logo"]): Promise<{ readonly width: number; readonly bottom: number } | null> {
  if (logo === null) return null;
  const image = logo.kind === "png" ? await document.embedPng(logo.bytes) : await document.embedJpg(logo.bytes);
  return layout.imageTopRight(image, LOGO_MAX);
}

function drawHeading(layout: Layout, data: InvoicePdfData, logo: { readonly width: number; readonly bottom: number } | null): void {
  // Con logo, los textos de la cabecera no pasan por debajo de él.
  const width = logo === null ? WIDTH : WIDTH - logo.width - 4 * MM;
  if (data.draft && data.preview !== true) {
    layout.write(DRAFT_NOTICE, { bold: true, color: RED, width });
    layout.gap(4);
  }
  if (data.annulled) {
    layout.write("ANULADA: factura expedida por error; consta su registro de anulación VERI*FACTU.", { bold: true, color: RED, width });
    layout.gap(4);
  }
  layout.write(data.title, { bold: true, size: TITLE, width });
  layout.gap(2);
  layout.write(`${data.draft && data.preview !== true ? "Fecha" : "Fecha de expedición"}: ${data.issueDate}`, { width, color: GRAY });
  if (logo !== null) layout.below(logo.bottom);
  layout.gap(3 * MM);
  layout.rule(ACCENT, 1.2);
  layout.gap(5 * MM);
}

function drawPayment(layout: Layout, payment: readonly string[]): void {
  if (payment.length === 0) return;
  layout.gap(4 * MM);
  layout.write("Forma de pago", { bold: true, size: SMALL, color: GRAY });
  layout.gap(1);
  for (const line of payment) layout.write(line);
}

function drawClosing(layout: Layout, data: InvoicePdfData): void {
  if (data.notes !== null) {
    layout.gap(4 * MM);
    layout.write(`Observaciones: ${data.notes}`);
  }
  if (data.verifactu === null && !data.draft && data.preview !== true) {
    layout.gap(4 * MM);
    layout.write("Factura emitida antes de VERI*FACTU: sin registro de facturación ni código QR.", { color: GRAY });
  }
  if (data.legal.length > 0) {
    layout.gap(4 * MM);
    for (const line of data.legal) layout.write(line, { size: SMALL, color: GRAY });
  }
  if (data.preview === true) {
    layout.gap(6 * MM);
    layout.rule();
    layout.gap(2 * MM);
    layout.write(PREVIEW_NOTICE, { size: 7, color: GRAY });
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
  drawHeading(layout, data, await drawLogo(layout, document, data.logo));
  drawParties(layout, data);
  if (data.rectification !== null) {
    layout.gap(4 * MM);
    layout.write(data.rectification);
  }
  layout.gap(4 * MM);
  drawLines(layout, data.lines);
  layout.gap(3 * MM);
  drawAmounts(layout, data.amounts);
  drawPayment(layout, data.payment);
  drawClosing(layout, data);
  if (data.draft && data.preview !== true) layout.watermark("BORRADOR");
  layout.numberPages();
  return document.save();
}
