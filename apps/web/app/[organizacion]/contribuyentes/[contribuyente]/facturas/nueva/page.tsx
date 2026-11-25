import type { Metadata } from "next";
import { streamedPage } from "@/components/form";
import { TaxpayerFrame } from "@/components/taxpayer-frame";
import { requireTaxpayer } from "@/lib/server/session";
import { saveDraftAction } from "../actions";
import { editorData, invoicesPath } from "../editor-data";
import { InvoiceEditor } from "../invoice-editor";

export const metadata: Metadata = { title: "Nueva factura" };

export default streamedPage("Preparando la factura…", NewInvoice);

async function NewInvoice({ params }: { readonly params: PageProps<"/[organizacion]/contribuyentes/[contribuyente]/facturas/nueva">["params"] }) {
  const { organizacion, contribuyente } = await params;
  const { user, context, taxpayer } = await requireTaxpayer(organizacion, contribuyente, `${invoicesPath(organizacion, contribuyente)}/nueva`);
  const { customers, products } = await editorData(context);

  return (
    <TaxpayerFrame user={user} context={context} taxpayer={taxpayer} current="facturas">
      <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[1.75rem]">Nueva factura</h1>
      <InvoiceEditor
        action={saveDraftAction.bind(null, context.tenant.slug, taxpayer.id, null)}
        customers={customers}
        products={products}
        initial={{ customerId: "", withholdingPercent: "", notes: "", lines: [] }}
        newCustomerHref={`/${context.tenant.slug}/contribuyentes/${taxpayer.id}/clientes`}
      />
    </TaxpayerFrame>
  );
}
