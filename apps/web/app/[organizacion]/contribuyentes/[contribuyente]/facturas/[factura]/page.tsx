import { formatAmount, formatDecimal, SCALE } from "@facturalibre/fiscal-core";
import { getInvoice, type BillingRecordView, type InvoiceDetail } from "@facturalibre/tenancy";
import { qrSvg, qrUrl } from "@facturalibre/verifactu";
import type { Metadata } from "next";
import { Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { FormAlert, streamedPage } from "@/components/form";
import { InvoiceStatus, invoiceState, StatusBadge, type Tone } from "@/components/invoice-status";
import { TaxpayerFrame } from "@/components/taxpayer-frame";
import { buttonVariants } from "@/components/ui/button";
import { partyFrom, spanishDate, spanishDateTime, type Party } from "@/lib/invoice-view";
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

const percent = (scaled: bigint): string => `${formatDecimal(scaled, SCALE.percent)} %`;

function PartyBlock({ title, party }: { readonly title: string; readonly party: Party }) {
  return (
    <section className="grid content-start gap-0.5 text-sm">
      <h2 className="mb-1 text-xs font-medium text-muted-foreground">{title}</h2>
      <p className="font-semibold">{party.legalName}</p>
      {party.nif === null ? null : <p className="font-mono">NIF {party.nif}</p>}
      {party.address === "" ? null : <p className="text-muted-foreground">{party.address}</p>}
    </section>
  );
}

function Lines({ invoice }: { readonly invoice: InvoiceDetail }) {
  return (
    <>
      <table className="figures hidden w-full text-sm sm:table">
        <caption className="sr-only">Líneas de la factura</caption>
        <thead className="border-b text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="py-2 pr-3 font-medium">
              Descripción
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Cantidad
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Precio
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Dto.
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              IVA
            </th>
            <th scope="col" className="py-2 pl-3 text-right font-medium">
              Base
            </th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line) => (
            <tr key={line.position} className="border-b">
              <td className="py-2.5 pr-3">{line.description}</td>
              <td className="px-3 py-2.5 text-right">{formatDecimal(line.quantity, SCALE.quantity)}</td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatDecimal(line.unitPrice, SCALE.unitPrice)} €</td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap">{line.discountPercent === 0n ? "—" : percent(line.discountPercent)}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">{taxLabel(line.taxKey)}</td>
              <td className="py-2.5 pl-3 text-right whitespace-nowrap">{formatAmount(line.lineBase)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* En móvil, cada línea en dos renglones: qué y cuánto. */}
      <ul className="figures grid divide-y border-y text-sm sm:hidden" aria-label="Líneas de la factura">
        {invoice.lines.map((line) => (
          <li key={line.position} className="grid grid-cols-[1fr_auto] gap-x-3 py-2.5">
            <span className="font-semibold">{line.description}</span>
            <span className="text-right font-semibold whitespace-nowrap">{formatAmount(line.lineBase)}</span>
            <span className="col-span-2 text-muted-foreground">
              {formatDecimal(line.quantity, SCALE.quantity)} × {formatDecimal(line.unitPrice, SCALE.unitPrice)} €
              {line.discountPercent === 0n ? "" : `, dto. ${percent(line.discountPercent)}`}, {taxLabel(line.taxKey)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function AmountRow({ label, value, strong = false }: { readonly label: ReactNode; readonly value: string; readonly strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "mt-2 border-t pt-3 text-lg font-semibold" : "text-muted-foreground [&>dd]:text-foreground"}`}>
      <dt>{label}</dt>
      <dd className="whitespace-nowrap">{value}</dd>
    </div>
  );
}

function Totals({ invoice }: { readonly invoice: InvoiceDetail }) {
  return (
    <section aria-labelledby="importes" className="figures ml-auto w-full max-w-sm text-sm">
      <h2 id="importes" className="sr-only">
        Importes
      </h2>
      <dl className="grid gap-1">
        {invoice.breakdown.map((entry) => (
          <AmountRow
            key={entry.key}
            label={`${taxLabel(entry.key)} sobre ${formatAmount(entry.base)}`}
            value={`${formatAmount(entry.quota)}${entry.surchargeQuota === 0n ? "" : ` + RE ${percent(entry.surchargePercent)}: ${formatAmount(entry.surchargeQuota)}`}`}
          />
        ))}
        <div className="border-t" />
        <AmountRow label="Base imponible" value={formatAmount(invoice.taxableBase)} />
        <AmountRow label="IVA" value={formatAmount(invoice.vatTotal)} />
        {invoice.surchargeTotal === 0n ? null : <AmountRow label="Recargo de equivalencia" value={formatAmount(invoice.surchargeTotal)} />}
        {invoice.withholdingAmount === 0n ? null : (
          <AmountRow label={`Retención IRPF (${percent(invoice.withholdingPercent)})`} value={`−${formatAmount(invoice.withholdingAmount)}`} />
        )}
        <AmountRow label="Total" value={formatAmount(invoice.total)} strong />
      </dl>
    </section>
  );
}

const STATUS_TEXT: Readonly<Record<BillingRecordView["status"], { readonly label: string; readonly tone: Tone }>> = {
  PENDING: { label: "Pendiente de remitir", tone: "neutral" },
  ACCEPTED: { label: "Aceptado por la AEAT", tone: "success" },
  ACCEPTED_WITH_ERRORS: { label: "Aceptado con errores", tone: "warning" },
  REJECTED: { label: "Rechazado por la AEAT", tone: "danger" },
};

/**
 * QR tributario (OM HAC/1177/2024, arts. 20 y 21; especificación del QR v0.5.0, apartado 3): al principio de la
 * factura, centrado, precedido de «QR tributario:» y seguido de «VERI*FACTU»; entre 30 y 40 mm y con margen
 * blanco de al menos 2 mm (6 mm recomendados). Imagen con texto alternativo, sin HTML inyectado.
 */
async function TaxQr({ record }: { readonly record: BillingRecordView }) {
  const url = qrUrl(
    qrEnvironment(),
    {
      issuerNif: record.issuerNif,
      number: record.invoiceNumber,
      issueDate: record.issueDate,
    },
    record.importeTotal ?? "",
  );
  const svg = await qrSvg(url);
  return (
    <section aria-label="QR tributario" className="mx-auto grid justify-items-center text-center text-base font-semibold">
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
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <StatusBadge tone={STATUS_TEXT[record.status].tone}>{STATUS_TEXT[record.status].label}</StatusBadge>
      </div>
      <dl className="grid gap-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Posición</dt>
          <dd>Nº {record.sequence} de la cadena</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Generado</dt>
          <dd className="text-right">{spanishDateTime(record.generatedAt)}</dd>
        </div>
        {record.aeatErrorDescription === null ? null : (
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground">Respuesta de la AEAT</dt>
            <dd>
              {record.aeatErrorCode ?? ""} {record.aeatErrorDescription}
            </dd>
          </div>
        )}
        {record.aeatCsv === null ? null : (
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground">CSV de la AEAT</dt>
            <dd className="font-mono break-all">{record.aeatCsv}</dd>
          </div>
        )}
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground">Huella</dt>
          <dd className="font-mono text-xs break-all">{record.hash}</dd>
        </div>
      </dl>
    </div>
  );
}

function VerifactuInfo({ invoice }: { readonly invoice: InvoiceDetail }) {
  const { alta, anulacion } = invoice.verifactu;
  return (
    <section aria-labelledby="verifactu" className="surface grid gap-4 p-5">
      <h2 id="verifactu" className="font-semibold">
        Registro VERI*FACTU
      </h2>
      {alta === null ? (
        <p className="text-sm text-muted-foreground">Esta factura se emitió antes de activar VERI*FACTU en FacturaLibre: no tiene registro de facturación.</p>
      ) : (
        <RecordInfo title="Registro de alta" record={alta} />
      )}
      {anulacion === null ? null : <RecordInfo title="Registro de anulación" record={anulacion} />}
    </section>
  );
}

/** Acción poco frecuente, plegada para que no compita con lo habitual; se abre para usarla. */
function Disclosure({
  title,
  description,
  tone = "default",
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly tone?: "default" | "danger";
  readonly children: ReactNode;
}) {
  return (
    <details className="surface group p-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[14px] px-5 py-3.5 text-sm font-semibold hover:bg-subtle [&::-webkit-details-marker]:hidden">
        <span className={tone === "danger" ? "text-destructive" : ""}>{title}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180">
          <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </summary>
      <div className="grid gap-3 px-5 pb-5">
        <p className="text-sm text-muted-foreground">{description}</p>
        {children}
      </div>
    </details>
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
  const state = invoiceState(invoice);
  const issuer = partyFrom(invoice.issuerSnapshot) ?? {
    legalName: taxpayer.legalName,
    nif: taxpayer.nif,
    address: "",
  };
  const recipient = partyFrom(invoice.customerSnapshot) ?? {
    legalName: invoice.customerName,
    nif: null,
    address: "",
  };
  const { alta, anulacion } = invoice.verifactu;
  const canAnnul = can("invoices.rectify") && alta !== null && anulacion === null;
  const canRectify = !draft && can("invoices.rectify") && anulacion === null;

  return (
    <TaxpayerFrame user={user} context={context} taxpayer={taxpayer} current="facturas">
      <div className="grid gap-3">
        <Link href={invoicesPath(slug, taxpayer.id)} className="w-fit text-sm text-muted-foreground hover:text-foreground">
          Volver a facturas
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[1.75rem]">
                {invoice.kind === "RECTIFYING" ? "Factura rectificativa " : "Factura "}
                {invoice.number ?? "(borrador)"}
              </h1>
              <InvoiceStatus state={state} />
            </div>
            <p className="text-sm text-muted-foreground">
              {draft ? "Borrador: todavía no tiene número ni validez fiscal." : `Expedida el ${spanishDate(invoice.issueDate ?? "")}. No se puede modificar.`}
            </p>
          </div>
          {draft ? null : (
            <a href={`${path}/pdf`} download className={buttonVariants()}>
              <Download aria-hidden="true" />
              Descargar PDF
            </a>
          )}
        </div>
      </div>

      {anulacion === null ? null : (
        <FormAlert tone="error">
          <strong>Factura anulada</strong>
          {anulada === undefined ? "" : " ahora"}: se expidió por error y tiene registro de anulación VERI*FACTU.
        </FormAlert>
      )}
      {!draft && emitida === invoice.number ? (
        <FormAlert tone="success">
          Factura <strong>{invoice.number}</strong> emitida. Ya no se puede modificar.
        </FormAlert>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <article aria-label="Factura" className="surface min-w-0 overflow-x-auto">
          <div className="grid min-w-0 gap-8 p-5 sm:p-8">
            {alta === null || anulacion !== null ? null : <TaxQr record={alta} />}
            {invoice.kind === "RECTIFYING" ? (
              <p className="rounded-lg bg-accent px-4 py-3 text-sm text-accent-foreground">
                Rectifica la factura <strong>{invoice.rectifiesNumber ?? ""}</strong> ({rectificationLabel(invoice.rectificationCode)}). Motivo:{" "}
                {invoice.rectificationReason ?? ""}
              </p>
            ) : null}
            <div className="grid gap-6 sm:grid-cols-2">
              <PartyBlock title="Emisor" party={issuer} />
              <PartyBlock title="Destinatario" party={recipient} />
            </div>
            <Lines invoice={invoice} />
            <Totals invoice={invoice} />
            {invoice.notes === null ? null : (
              <p className="border-t pt-4 text-sm">
                <span className="text-muted-foreground">Observaciones:</span> {invoice.notes}
              </p>
            )}
          </div>
        </article>

        <div className="grid content-start gap-4">
          <section aria-label="Resumen" className="surface grid gap-3 p-5">
            <p className="grid">
              <span className="text-xs font-medium text-muted-foreground">Total</span>
              <span className="figures text-[1.75rem] font-semibold tracking-[-0.02em]">{formatAmount(invoice.total)}</span>
            </p>
            <dl className="grid gap-1.5 border-t pt-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Cliente</dt>
                <dd className="truncate text-right font-medium">{recipient.legalName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Fecha</dt>
                <dd className="figures">{invoice.issueDate === null ? "Sin emitir" : spanishDate(invoice.issueDate)}</dd>
              </div>
            </dl>
          </section>
          {draft ? (
            <section aria-labelledby="acciones" className="surface grid gap-4 p-5">
              <h2 id="acciones" className="font-semibold">
                Emitir
              </h2>
              {can("invoices.issue") ? (
                <IssueForm action={issueAction.bind(null, slug, taxpayer.id, invoice.id)} total={formatAmount(invoice.total)} />
              ) : (
                <p className="text-sm text-muted-foreground">Tu rol puede preparar borradores; emitirlos corresponde a un contable o administrador.</p>
              )}
              {can("invoices.draft") ? (
                <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                  <Link href={`${path}/editar`} className={buttonVariants({ variant: "outline" })}>
                    Editar borrador
                  </Link>
                  <DeleteDraftForm action={deleteDraftAction.bind(null, slug, taxpayer.id, invoice.id)} />
                </div>
              ) : null}
            </section>
          ) : (
            <VerifactuInfo invoice={invoice} />
          )}
          {canRectify ? (
            <Disclosure
              title="Corregir con una rectificativa"
              description="Una factura emitida no se modifica: se corrige con una factura rectificativa, que se numera en su propia serie."
            >
              <RectifyForm action={rectifyAction.bind(null, slug, taxpayer.id, invoice.id)} />
            </Disclosure>
          ) : null}
          {canAnnul ? (
            <Disclosure
              title="Anular: se expidió por error"
              tone="danger"
              description="Solo si no hubo ninguna operación real (por ejemplo, una factura duplicada). Si la operación existió y algo está mal, rectifícala."
            >
              <AnnulForm action={annulAction.bind(null, slug, taxpayer.id, invoice.id)} />
            </Disclosure>
          ) : null}
        </div>
      </div>
    </TaxpayerFrame>
  );
}
