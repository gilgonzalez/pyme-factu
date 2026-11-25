// Lectura del PDF generado para los tests: lo que se ve en cada página (textos con su fuente, tamaño, color y
// posición; imágenes con su caja), sacado del contenido real que escribe pdf-lib.
import { inflateSync } from "node:zlib";
import { PDFArray, PDFDocument, PDFRawStream, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

export const MM = 72 / 25.4;
export const PAGE = { width: 595.28, height: 841.89 };

export interface TextRun {
  readonly text: string;
  readonly x: number;
  /** Línea base. */
  readonly y: number;
  readonly size: number;
  readonly bold: boolean;
  /** "r g b" tal como se escribe en el PDF. */
  readonly color: string;
  /** Ancho del texto con la fuente y el tamaño usados. */
  readonly width: number;
}

export interface ImageBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ReadPage {
  readonly runs: readonly TextRun[];
  readonly images: readonly ImageBox[];
}

function contentOf(page: PDFPage): string {
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => page.doc.context.lookup(ref)) : [contents];
  return streams
    .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
    .map((stream) => inflateSync(Buffer.from(stream.contents)).toString("latin1"))
    .join("\n");
}

const decode = (hex: string): string => Buffer.from(hex, "hex").toString("latin1").replace(/\x80/g, "€").replace(/\x97/g, "—").replace(/\x96/g, "–");

function runsOf(content: string, fonts: { regular: PDFFont; bold: PDFFont }): TextRun[] {
  const pattern = /([\d.]+ [\d.]+ [\d.]+) rg\s+\/Helvetica(-Bold)?-\d+ ([\d.]+) Tf[\s\S]*?1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm\s+<([0-9A-Fa-f]*)> Tj/g;
  return [...content.matchAll(pattern)].map((match) => {
    const bold = match[2] !== undefined;
    const size = Number(match[3]);
    const text = decode(match[6] ?? "");
    const font = bold ? fonts.bold : fonts.regular;
    return { text, x: Number(match[4]), y: Number(match[5]), size, bold, color: match[1] ?? "", width: font.widthOfTextAtSize(text, size) };
  });
}

/** pdf-lib dibuja cada imagen en un bloque «q … Q»: la primera «cm» traslada (x, y) y la de mayor escala da el tamaño. */
function imagesOf(content: string): ImageBox[] {
  return content
    .split(/\bq\b/)
    .filter((block) => / Do\b/.test(block))
    .map((block) => {
      const matrices = [...block.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) cm/g)].map((match) => match.slice(1, 7).map(Number));
      const [translate] = matrices;
      return {
        x: translate?.[4] ?? 0,
        y: translate?.[5] ?? 0,
        width: Math.max(...matrices.map((matrix) => matrix[0] ?? 0)),
        height: Math.max(...matrices.map((matrix) => matrix[3] ?? 0)),
      };
    });
}

export interface ReadPdf {
  readonly document: PDFDocument;
  readonly pages: readonly ReadPage[];
  /** Textos de cada página, en orden de escritura. */
  readonly texts: readonly (readonly string[])[];
  /** Medida de un texto como lo mide el PDF. */
  readonly measure: (text: string, size: number, bold?: boolean) => number;
}

export async function readPdf(bytes: Uint8Array): Promise<ReadPdf> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const metrics = await PDFDocument.create();
  const fonts = { regular: await metrics.embedFont(StandardFonts.Helvetica), bold: await metrics.embedFont(StandardFonts.HelveticaBold) };
  const pages = document.getPages().map((page) => {
    const content = contentOf(page);
    return { runs: runsOf(content, fonts), images: imagesOf(content) };
  });
  return {
    document,
    pages,
    texts: pages.map((page) => page.runs.map((run) => run.text)),
    measure: (text, size, bold = false) => (bold ? fonts.bold : fonts.regular).widthOfTextAtSize(text, size),
  };
}
