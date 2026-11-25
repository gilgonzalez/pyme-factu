import { formatAmount } from "@facturalibre/fiscal-core";
import { listInvoices } from "@facturalibre/tenancy";
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

async function Invoices({ params }: { readonly params: PageProps<"/[organizacion]/contribuyentes/[contribuyente]/facturas">["params"] }) {
  const { organizacion, contribuyente } = await params;
  const path = invoicesPath(organizacion, contribuyente);
  const { user, context, taxpayer } = await requireTaxpayer(organizacion, contribuyente, path);
  const invoices = await listInvoices(getDatabase(), context);

  return (
    <TaxpayerFrame user={user} context={context} taxpayer={taxpayer} current="facturas">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-heading text-[1.95rem] leading-tight font-bold tracking-[-0.02em]">Facturas</h1>
        {context.permissions.has("invoices.draft") ? (
          <Link href={`${path}/nueva`} className={buttonVariants({ size: "lg" })}>
            Nueva factura
          </Link>
        ) : null}
      </div>
      {invoices.length === 0 ? (
        <div className="sheet grid justify-items-start gap-2 p-8">
          <h2 className="text-lg font-bold">Aún no hay facturas</h2>
          <p className="text-muted-foreground">Prepara un borrador: no tendrá número ni validez fiscal hasta que lo emitas.</p>
        </div>
      ) : (
        <div className="sheet overflow-x-auto">
          <table className="figures w-full text-sm">
            <caption className="sr-only">Facturas de {taxpayer.legalName}</caption>
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">Número</th>
                <th scope="col" className="px-3 py-3 font-semibold">Estado</th>
                <th scope="col" className="hidden px-3 py-3 font-semibold sm:table-cell">Fecha</th>
                <th scope="col" className="hidden px-3 py-3 font-semibold md:table-cell">Cliente</th>
                <th scope="col" className="px-5 py-3 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-t first:border-t-0 hover:bg-accent/40">
                  <td className="px-5 py-3">
                    <Link href={`${path}/${invoice.id}`} className="font-mono font-bold whitespace-nowrap text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary">
                      {invoice.number ?? "Borrador"}
                    </Link>
                    {invoice.kind === "RECTIFYING" ? <span className="ml-2 text-xs font-semibold whitespace-nowrap text-muted-foreground">Rectificativa</span> : null}
                    <span className="block text-muted-foreground md:hidden">{invoice.customerName}</span>
                  </td>
                  <td className="px-3 py-3">
                    <InvoiceStatus state={invoiceState(invoice)} />
                  </td>
                  <td className="hidden px-3 py-3 sm:table-cell">{formatDate(invoice.issueDate)}</td>
                  <td className="hidden px-3 py-3 md:table-cell">{invoice.customerName}</td>
                  <td className="px-5 py-3 text-right font-semibold whitespace-nowrap">{formatAmount(invoice.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TaxpayerFrame>
  );
}
