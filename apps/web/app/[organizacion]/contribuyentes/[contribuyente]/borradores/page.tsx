import { formatAmount } from "@facturalibre/fiscal-core";
import { listInvoices } from "@facturalibre/tenancy";
import { Download, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { streamedPage } from "@/components/form";
import { TaxpayerFrame } from "@/components/taxpayer-frame";
import { buttonVariants } from "@/components/ui/button";
import { getDatabase } from "@/lib/server/db";
import { requireTaxpayer } from "@/lib/server/session";
import { invoicesPath } from "../facturas/editor-data";

export const metadata: Metadata = { title: "Borradores" };

export default streamedPage("Cargando los borradores…", Drafts, "frame");

/**
 * Borradores: facturas aún sin número ni validez fiscal. Se editan, se descargan en PDF o se envían al cliente
 * para que los revise, y se emiten cuando estén listos.
 */
async function Drafts({ params }: { readonly params: PageProps<"/[organizacion]/contribuyentes/[contribuyente]/borradores">["params"] }) {
  const { organizacion, contribuyente } = await params;
  const path = invoicesPath(organizacion, contribuyente);
  const { user, context, taxpayer } = await requireTaxpayer(organizacion, contribuyente, `/${organizacion}/contribuyentes/${contribuyente}/borradores`);
  const drafts = (await listInvoices(getDatabase(), context)).filter((invoice) => invoice.status === "DRAFT");
  const pending = drafts.reduce((sum, invoice) => sum + invoice.total, 0n);

  return (
    <TaxpayerFrame user={user} context={context} taxpayer={taxpayer} current="borradores">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[1.75rem]">Borradores</h1>
          <p className="text-sm text-muted-foreground">Sin número ni validez fiscal hasta que los emitas. Puedes enviárselos al cliente para que los revise.</p>
        </div>
        {context.permissions.has("invoices.draft") ? (
          <Link href={`${path}/nueva`} className={buttonVariants()}>
            <Plus aria-hidden="true" />
            Nuevo borrador
          </Link>
        ) : null}
      </div>

      {drafts.length === 0 ? (
        <div className="surface grid justify-items-start gap-2 p-8">
          <h2 className="font-semibold">No hay borradores</h2>
          <p className="text-muted-foreground">Prepara uno: podrás descargarlo en PDF o enviarlo al cliente antes de emitir la factura.</p>
        </div>
      ) : (
        <>
          <section aria-label="Resumen de borradores" className="figures flex flex-wrap items-end gap-x-10 gap-y-3">
            <p className="grid">
              <span className="text-sm text-muted-foreground">Pendiente de emitir</span>
              <span className="text-[2rem] leading-tight font-semibold tracking-[-0.03em]">{formatAmount(pending)}</span>
            </p>
            <p className="pb-1 text-sm text-muted-foreground">
              {drafts.length} {drafts.length === 1 ? "borrador" : "borradores"}
            </p>
          </section>
          <div className="surface overflow-x-auto">
            <table className="figures w-full text-sm">
              <caption className="sr-only">Borradores de {taxpayer.legalName}</caption>
              <thead className="border-b bg-subtle text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium">Cliente</th>
                  <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">Tipo</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Total</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium">
                    <span className="sr-only">PDF</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((invoice) => (
                  <tr key={invoice.id} className="relative border-t first:border-t-0 hover:bg-subtle active:bg-subtle">
                    <td className="px-5 py-3.5">
                      {/* Toda la fila abre el borrador (zona táctil amplia en el móvil); el PDF queda por encima. */}
                      <Link
                        href={`${path}/${invoice.id}`}
                        className="font-medium after:absolute after:inset-0 hover:text-primary hover:underline hover:underline-offset-4"
                      >
                        {invoice.customerName}
                      </Link>
                    </td>
                    <td className="hidden px-3 py-3 text-muted-foreground sm:table-cell">{invoice.kind === "RECTIFYING" ? "Rectificativa" : "Factura"}</td>
                    <td className="px-3 py-3 text-right font-medium whitespace-nowrap">{formatAmount(invoice.total)}</td>
                    <td className="relative z-10 px-5 py-3 text-right">
                      <a
                        href={`${path}/${invoice.id}/pdf`}
                        download
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                        aria-label={`Descargar en PDF el borrador para ${invoice.customerName}`}
                      >
                        <Download aria-hidden="true" />
                        PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </TaxpayerFrame>
  );
}
