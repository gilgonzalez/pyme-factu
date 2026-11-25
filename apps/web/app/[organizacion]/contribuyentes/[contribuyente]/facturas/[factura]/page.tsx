import { formatAmount, formatDecimal, SCALE } from "@facturalibre/fiscal-core";
import { getInvoice, type BillingRecordView, type InvoiceDetail } from "@facturalibre/tenancy";
import { qrSvg, qrUrl } from "@facturalibre/verifactu";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAlert, streamedPage } from "@/components/form";
import { TaxpayerFrame } from "@/components/taxpayer-frame";
import { buttonVariants } from "@/components/ui/button";
import { rectificationLabel, taxLabel } from "@/lib/invoicing";
import { getDatabase } from "@/lib/server/db";
import { requireTaxpayer } from "@/lib/server/session";
import { qrEnvironment } from "@/lib/server/verifactu";
import { annulAction, deleteDraftAction, issueAction, rectifyAction } from "../actions";
import { invoicesPath } from "../editor-data";
import { AnnulForm, DeleteDraftForm, IssueForm, RectifyForm } from "./invoice-actions";

export const metadata: Metadata = { title: "Factura" };

export default streamedPage("Cargando la factura…", Invoice);

type Props = PageProps<"/[organizacion]/contribuyentes/[contribuyente]/facturas/[factura]">;

interface Party {
  readonly legalName: string;
  readonly nif: string | null;
  readonly address: string;
}

/** Datos de una parte a partir de la instantánea guardada al emitir (o null si aún es borrador). */
function partyFrom(snapshot: unknown): Party | null {
  if (typeof snapshot !== "object" || snapshot === null) return null;
  const data = snapshot as Record<string, unknown>;
  const text = (key: string): string | null => (typeof data[key] === "string" ? data[key] : null);
  const address = [text("addressLine"), [text("postalCode"), text("city")].filter(Boolean).join(" "), text("province")].filter(Boolean).join(", ");
  return { legalName: text("legalName") ?? "", nif: text("nif"), address };
}

function PartyCard({ title, party }: { readonly title: string; readonly party: Party }) {
  return (
    <section className="grid gap-0.5 rounded-xl border p-4 text-sm">
      <h2 className="font-medium">{title}</h2>
      <p>{party.legalName}</p>
      {party.nif === null ? null : <p>NIF {party.nif}</p>}
      {party.address === "" ? null : <p className="text-muted-foreground">{party.address}</p>}
    </section>
  );
}

function Lines({ invoice }: { readonly invoice: InvoiceDetail }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <caption className="sr-only">Líneas de la factura</caption>
        <thead className="bg-muted/50 text-left">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Descripción</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Cantidad</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Precio</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Dto.</th>
            <th scope="col" className="px-3 py-2 font-medium">IVA</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Base</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line) => (
            <tr key={line.position} className="border-t">
              <td className="px-3 py-2">{line.description}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(line.quantity, SCALE.quantity)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(line.unitPrice, SCALE.unitPrice)} €</td>
              <td className="px-3 py-2 text-right tabular-nums">{line.discountPercent === 0n ? "—" : `${formatDecimal(line.discountPercent, SCALE.percent)} %`}</td>
              <td className="px-3 py-2">{taxLabel(line.taxKey)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatAmount(line.lineBase)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Totals({ invoice }: { readonly invoice: InvoiceDetail }) {
  return (
    <section aria-labelledby="importes" className="ml-auto grid w-full max-w-sm gap-1 text-sm">
      <h2 id="importes" className="sr-only">
        Importes
      </h2>
      {invoice.breakdown.map((entry) => (
        <p key={entry.key} className="flex justify-between gap-4">
          <span>
            {taxLabel(entry.key)} sobre {formatAmount(entry.base)}
          </span>
          <span className="tabular-nums">
            {formatAmount(entry.quota)}
            {entry.surchargeQuota === 0n ? "" : ` + RE ${formatDecimal(entry.surchargePercent, SCALE.percent)} %: ${formatAmount(entry.surchargeQuota)}`}
          </span>
        </p>
      ))}
      <p className="flex justify-between border-t pt-1">
        <span>Base imponible</span>
        <span className="tabular-nums">{formatAmount(invoice.taxableBase)}</span>
      </p>
      <p className="flex justify-between">
        <span>IVA</span>
        <span className="tabular-nums">{formatAmount(invoice.vatTotal)}</span>
      </p>
      {invoice.surchargeTotal === 0n ? null : (
        <p className="flex justify-between">
          <span>Recargo de equivalencia</span>
          <span className="tabular-nums">{formatAmount(invoice.surchargeTotal)}</span>
        </p>
      )}
      {invoice.withholdingAmount === 0n ? null : (
        <p className="flex justify-between">
          <span>Retención IRPF ({formatDecimal(invoice.withholdingPercent, SCALE.percent)} %)</span>
          <span className="tabular-nums">−{formatAmount(invoice.withholdingAmount)}</span>
        </p>
      )}
      <p className="flex justify-between border-t pt-1 text-base font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatAmount(invoice.total)}</span>
      </p>
    </section>
  );
}

const STATUS_TEXT: Readonly<Record<BillingRecordView["status"], string>> = {
  PENDING: "Pendiente de remitir a la AEAT",
  ACCEPTED: "Aceptado por la AEAT",
  ACCEPTED_WITH_ERRORS: "Aceptado por la AEAT con errores: hay que revisarlo",
  REJECTED: "Rechazado por la AEAT: hay que revisarlo",
};

/**
 * QR tributario (OM HAC/1177/2024, arts. 20 y 21; especificación del QR v0.5.0, apartado 3): al principio de la
 * factura, centrado, precedido de «QR tributario:» y seguido de «VERI*FACTU»; entre 30 y 40 mm y con margen
 * blanco de al menos 2 mm (6 mm recomendados). Imagen con texto alternativo, sin HTML inyectado.
 */
async function TaxQr({ record }: { readonly record: BillingRecordView }) {
  const url = qrUrl(qrEnvironment(), { issuerNif: record.issuerNif, number: record.invoiceNumber, issueDate: record.issueDate }, record.importeTotal ?? "");
  const svg = await qrSvg(url);
  return (
    <section aria-label="QR tributario" className="mx-auto grid justify-items-center gap-1 text-center text-base font-medium">
      <p>QR tributario:</p>
      <a href={url} target="_blank" rel="noopener noreferrer" className="bg-white" style={{ padding: "6mm" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG generado en el servidor como data URI */}
        <img
          src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`}
          alt={`Código QR tributario de la factura ${record.invoiceNumber}: abre su cotejo en la sede electrónica de la AEAT`}
          style={{ width: "35mm", height: "35mm" }}
        />
      </a>
      <p>VERI*FACTU</p>
    </section>
  );
}

function RecordInfo({ title, record }: { readonly title: string; readonly record: BillingRecordView }) {
  return (
    <div className="grid gap-0.5">
      <h3 className="font-medium">{title}</h3>
      <p>
        Nº {record.sequence} de la cadena · generado {record.generatedAt} · {STATUS_TEXT[record.status]}
      </p>
      <p className="text-muted-foreground">
        Huella: <code className="break-all">{record.hash}</code>
      </p>
      {record.aeatCsv === null ? null : <p className="text-muted-foreground">CSV de la AEAT: {record.aeatCsv}</p>}
      {record.aeatErrorDescription === null ? null : (
        <p className={record.status === "REJECTED" ? "text-destructive" : "text-muted-foreground"}>
          AEAT ({record.aeatErrorCode ?? ""}): {record.aeatErrorDescription}
        </p>
      )}
    </div>
  );
}

function VerifactuInfo({ invoice }: { readonly invoice: InvoiceDetail }) {
  const { alta, anulacion } = invoice.verifactu;
  return (
    <section aria-labelledby="verifactu" className="grid gap-2 rounded-xl border p-4 text-sm">
      <h2 id="verifactu" className="font-medium">
        Registro VERI*FACTU
      </h2>
      {alta === null ? (
        <p className="text-muted-foreground">Esta factura se emitió antes de activar VERI*FACTU en FacturaLibre: no tiene registro de facturación.</p>
      ) : (
        <RecordInfo title="Registro de alta" record={alta} />
      )}
      {anulacion === null ? null : <RecordInfo title="Registro de anulación" record={anulacion} />}
    </section>
  );
}

async function Invoice({ params, searchParams }: { readonly params: Props["params"]; readonly searchParams: Props["searchParams"] }) {
  const { organizacion, contribuyente, factura } = await params;
  const { emitida, anulada } = await searchParams;
  const path = `${invoicesPath(organizacion, contribuyente)}/${factura}`;
  const { user, context, taxpayer } = await requireTaxpayer(organizacion, contribuyente, path);
  const invoice = await getInvoice(getDatabase(), context, factura);
  if (invoice === null) notFound();
  const can = (permission: Parameters<typeof context.permissions.has>[0]): boolean => context.permissions.has(permission);
  const slug = context.tenant.slug;
  const draft = invoice.status === "DRAFT";
  const issuer = partyFrom(invoice.issuerSnapshot) ?? { legalName: taxpayer.legalName, nif: taxpayer.nif, address: "" };
  const recipient = partyFrom(invoice.customerSnapshot) ?? { legalName: invoice.customerName, nif: null, address: "" };
  const { alta, anulacion } = invoice.verifactu;
  const canAnnul = can("invoices.rectify") && alta !== null && anulacion === null;

  return (
    <TaxpayerFrame user={user} context={context} taxpayer={taxpayer} current="facturas">
      <div className="grid gap-1">
        <Link href={invoicesPath(slug, taxpayer.id)} className="text-sm text-muted-foreground underline underline-offset-4">
          Volver a facturas
        </Link>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {invoice.kind === "RECTIFYING" ? "Factura rectificativa " : "Factura "}
          {invoice.number ?? "(borrador)"}
        </h1>
        <p className="text-muted-foreground">
          {draft ? "Borrador: todavía no tiene número ni validez fiscal." : `Expedida el ${invoice.issueDate ?? ""}. No se puede modificar.`}
        </p>
      </div>

      {alta === null || anulacion !== null ? null : <TaxQr record={alta} />}

      {anulacion === null ? null : (
        <FormAlert tone="error">
          <strong>Factura anulada</strong>{anulada === undefined ? "" : " ahora"}: se expidió por error y tiene registro de anulación VERI*FACTU.
        </FormAlert>
      )}

      {!draft && emitida === invoice.number ? (
        <FormAlert tone="success">
          Factura <strong>{invoice.number}</strong> emitida. Ya no se puede modificar.
        </FormAlert>
      ) : null}

      {invoice.kind === "RECTIFYING" ? (
        <FormAlert tone="success">
          Rectifica la factura <strong>{invoice.rectifiesNumber ?? ""}</strong> ({rectificationLabel(invoice.rectificationCode)}). Motivo:{" "}
          {invoice.rectificationReason ?? ""}
        </FormAlert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <PartyCard title="Emisor" party={issuer} />
        <PartyCard title="Destinatario" party={recipient} />
      </div>
      <Lines invoice={invoice} />
      <Totals invoice={invoice} />
      {invoice.notes === null ? null : <p className="text-sm">Observaciones: {invoice.notes}</p>}
      {draft ? null : <VerifactuInfo invoice={invoice} />}

      {draft ? (
        <section aria-labelledby="acciones" className="grid gap-4 rounded-xl border p-4">
          <h2 id="acciones" className="font-medium">
            Acciones
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            {can("invoices.draft") ? (
              <Link href={`${path}/editar`} className={buttonVariants({ variant: "outline" })}>
                Editar borrador
              </Link>
            ) : null}
            {can("invoices.draft") ? <DeleteDraftForm action={deleteDraftAction.bind(null, slug, taxpayer.id, invoice.id)} /> : null}
          </div>
          {can("invoices.issue") ? (
            <IssueForm action={issueAction.bind(null, slug, taxpayer.id, invoice.id)} total={formatAmount(invoice.total)} />
          ) : (
            <p className="text-sm text-muted-foreground">Tu rol puede preparar borradores; emitirlos corresponde a un contable o administrador.</p>
          )}
        </section>
      ) : can("invoices.rectify") && anulacion === null ? (
        <section aria-labelledby="rectificar" className="grid gap-3 rounded-xl border p-4">
          <h2 id="rectificar" className="font-medium">
            ¿Hay un error?
          </h2>
          <p className="text-sm text-muted-foreground">
            Una factura emitida no se modifica: se corrige con una factura rectificativa, que se numera en su propia serie.
          </p>
          <RectifyForm action={rectifyAction.bind(null, slug, taxpayer.id, invoice.id)} />
        </section>
      ) : null}

      {canAnnul ? (
        <section aria-labelledby="anular" className="grid gap-3 rounded-xl border border-destructive/40 p-4">
          <h2 id="anular" className="font-medium">
            ¿Se expidió por error?
          </h2>
          <p className="text-sm text-muted-foreground">
            Solo si no hubo ninguna operación real (por ejemplo, una factura duplicada). Si la operación existió y algo está mal, rectifícala.
          </p>
          <AnnulForm action={annulAction.bind(null, slug, taxpayer.id, invoice.id)} />
        </section>
      ) : null}
    </TaxpayerFrame>
  );
}
