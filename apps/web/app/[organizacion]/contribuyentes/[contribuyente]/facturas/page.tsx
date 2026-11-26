import { formatAmount } from "@facturalibre/fiscal-core";
import { listInvoices, type InvoiceSummary } from "@facturalibre/tenancy";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { streamedPage } from "@/components/form";
import { InvoiceStatus, invoiceState } from "@/components/invoice-status";
import { TaxpayerFrame } from "@/components/taxpayer-frame";
import { buttonVariants } from "@/components/ui/button";
import { getDatabase } from "@/lib/server/db";
import { requireTaxpayer } from "@/lib/server/session";
import { invoicesPath } from "./editor-data";

export const metadata: Metadata = { title: "Facturas" };

export default streamedPage("Cargando las facturas…", Invoices);

const dateFormat = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const formatDate = (date: string | null): string => (date === null ? "—" : dateFormat.format(new Date(`${date}T00:00:00Z`)));
const MONTH = new Intl.DateTimeFormat("es-ES", { month: "long", timeZone: "Europe/Madrid" });
/** "2026-11" del mes en curso, en hora peninsular. */
const currentMonth = (): string => new Date().toLocaleString("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit" }).slice(0, 7);

/** Lo emitido en el mes en curso (sin contar las anuladas) y los borradores pendientes. */
function monthSummary(invoices: readonly InvoiceSummary[]): { readonly total: bigint; readonly issued: number; readonly drafts: number } {
  const month = currentMonth();
  const issued = invoices.filter((invoice) => invoice.status === "ISSUED" && !invoice.annulled && invoice.issueDate?.startsWith(month) === true);
  return {
    total: issued.reduce((sum, invoice) => sum + invoice.total, 0n),
    issued: issued.length,
    drafts: invoices.filter((invoice) => invoice.status === "DRAFT").length,
  };
}

const count = (n: number, one: string, many: string): string => `${String(n)} ${n === 1 ? one : many}`;

async function Invoices({ params }: { readonly params: PageProps<"/[organizacion]/contribuyentes/[contribuyente]/facturas">["params"] }) {
  const { organizacion, contribuyente } = await params;
  const path = invoicesPath(organizacion, contribuyente);
  const { user, context, taxpayer } = await requireTaxpayer(organizacion, contribuyente, path);
  const all = await listInvoices(getDatabase(), context);
  const summary = monthSummary(all);
  // Los borradores tienen su propia sección: aquí solo lo emitido.
  const invoices = all.filter((invoice) => invoice.status === "ISSUED");

  return (
    <TaxpayerFrame user={user} context={context} taxpayer={taxpayer} current="facturas">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[1.75rem]">Facturas</h1>
        {context.permissions.has("invoices.draft") ? (
          <Link href={`${path}/nueva`} className={buttonVariants()}>
            <Plus aria-hidden="true" />
            Nueva factura
          </Link>
        ) : null}
      </div>

      <section aria-label="Resumen del mes" className="figures flex flex-wrap items-end gap-x-10 gap-y-3">
        <p className="grid">
          <span className="text-sm text-muted-foreground">Facturado en {MONTH.format(new Date())}</span>
          <span className="text-[2rem] leading-tight font-semibold tracking-[-0.03em]">{formatAmount(summary.total)}</span>
        </p>
        <p className="pb-1 text-sm text-muted-foreground">
          {count(summary.issued, "factura emitida", "facturas emitidas")}
          {summary.drafts === 0 ? null : (
            <>
              {", "}
              <Link href={`/${organizacion}/contribuyentes/${contribuyente}/borradores`} className="text-foreground underline underline-offset-4 hover:text-primary">
                {count(summary.drafts, "borrador", "borradores")} sin emitir
              </Link>
            </>
          )}
        </p>
      </section>

      {invoices.length === 0 ? (
        <div className="surface grid justify-items-start gap-2 p-8">
          <h2 className="font-semibold">Aún no hay facturas emitidas</h2>
          <p className="text-muted-foreground">Prepara un borrador: no tendrá número ni validez fiscal hasta que lo emitas. Los borradores están en su propia sección.</p>
        </div>
      ) : (
        <div className="surface overflow-x-auto">
          <table className="figures w-full text-sm">
            <caption className="sr-only">Facturas de {taxpayer.legalName}</caption>
            <thead className="border-b bg-subtle text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-medium">Número</th>
                <th scope="col" className="hidden px-3 py-2.5 font-medium md:table-cell">Cliente</th>
                <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">Fecha</th>
                <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">Estado</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-t first:border-t-0 hover:bg-subtle">
                  <td className="px-5 py-3">
                    <Link href={`${path}/${invoice.id}`} className="font-mono font-medium whitespace-nowrap hover:text-primary hover:underline hover:underline-offset-4">
                      {invoice.number}
                    </Link>
                    {invoice.kind === "RECTIFYING" ? <span className="ml-2 text-xs whitespace-nowrap text-muted-foreground">Rectificativa</span> : null}
                    <span className="block text-muted-foreground md:hidden">{invoice.customerName}</span>
                    <span className="mt-1 block sm:hidden">
                      <InvoiceStatus state={invoiceState(invoice)} />
                    </span>
                  </td>
                  <td className="hidden px-3 py-3 md:table-cell">{invoice.customerName}</td>
                  <td className="hidden px-3 py-3 text-muted-foreground sm:table-cell">{formatDate(invoice.issueDate)}</td>
                  <td className="hidden px-3 py-3 sm:table-cell">
                    <InvoiceStatus state={invoiceState(invoice)} />
                  </td>
                  <td className="px-5 py-3 text-right font-medium whitespace-nowrap">{formatAmount(invoice.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TaxpayerFrame>
  );
}
