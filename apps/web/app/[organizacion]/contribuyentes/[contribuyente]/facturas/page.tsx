import { formatAmount } from "@facturalibre/fiscal-core";
import { listInvoices } from "@facturalibre/tenancy";
import type { Metadata } from "next";
import Link from "next/link";
import { streamedPage } from "@/components/form";
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
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Facturas</h1>
        {context.permissions.has("invoices.draft") ? (
          <Link href={`${path}/nueva`} className={buttonVariants({ size: "lg" })}>
            Nueva factura
          </Link>
        ) : null}
      </div>
      {invoices.length === 0 ? (
        <p className="text-muted-foreground">Aún no hay facturas de este contribuyente.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <caption className="sr-only">Facturas de {taxpayer.legalName}</caption>
            <thead className="bg-muted/50 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Número</th>
                <th scope="col" className="px-3 py-2 font-medium">Fecha</th>
                <th scope="col" className="px-3 py-2 font-medium">Cliente</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-t">
                  <td className="px-3 py-2">
                    <Link href={`${path}/${invoice.id}`} className="font-medium underline underline-offset-4">
                      {invoice.number ?? "Borrador"}
                    </Link>
                    {invoice.kind === "RECTIFYING" ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">Rectificativa</span> : null}
                  </td>
                  <td className="px-3 py-2">{formatDate(invoice.issueDate)}</td>
                  <td className="px-3 py-2">{invoice.customerName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatAmount(invoice.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TaxpayerFrame>
  );
}
