// Comprobación de la cadena conservada (OM HAC/1177/2024, arts. 6 y 7): recalcula la huella de cada registro a
// partir de sus campos guardados y comprueba que enlaza con el inmediatamente anterior.
import { aeatDate } from "./format";
import { altaHashInput, anulacionHashInput, fingerprint } from "./hash";

/** Un registro tal como se conserva en la base de datos (campos de la huella y del enlace). */
export interface StoredRecord {
  readonly sequence: number;
  readonly kind: "ALTA" | "ANULACION";
  readonly issuerNif: string;
  readonly invoiceNumber: string;
  /** ISO (AAAA-MM-DD). */
  readonly issueDate: string;
  readonly invoiceType: string | null;
  readonly cuotaTotal: string | null;
  readonly importeTotal: string | null;
  readonly previousHash: string | null;
  readonly hash: string;
  readonly generatedAt: string;
}

export interface RecordCheck {
  readonly sequence: number;
  /** La huella guardada coincide con la recalculada desde los campos guardados. */
  readonly hashOk: boolean;
  /** Enlaza con el anterior (o es el primero: secuencia 1 sin huella anterior). */
  readonly linkOk: boolean;
}

function recomputedHash(record: StoredRecord): string {
  const common = { issuerNif: record.issuerNif, invoiceNumber: record.invoiceNumber, issueDate: aeatDate(record.issueDate), previousHash: record.previousHash ?? "", generatedAt: record.generatedAt };
  if (record.kind === "ANULACION") return fingerprint(anulacionHashInput(common));
  return fingerprint(altaHashInput({ ...common, invoiceType: record.invoiceType ?? "", cuotaTotal: record.cuotaTotal ?? "", importeTotal: record.importeTotal ?? "" }));
}

function linksTo(record: StoredRecord, previous: StoredRecord | undefined): boolean {
  if (previous === undefined) return record.sequence === 1 && record.previousHash === null;
  return record.sequence === previous.sequence + 1 && record.previousHash === previous.hash;
}

/** `records` ordenados por secuencia, empezando por el primero de la cadena. */
export const checkChain = (records: readonly StoredRecord[]): RecordCheck[] =>
  records.map((record, index) => ({ sequence: record.sequence, hashOk: recomputedHash(record) === record.hash, linkOk: linksTo(record, records[index - 1]) }));
