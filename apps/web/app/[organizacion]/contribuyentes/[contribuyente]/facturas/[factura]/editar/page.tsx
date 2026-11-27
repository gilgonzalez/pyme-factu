import { getBillingSettings, getInvoice } from "@facturalibre/tenancy";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { streamedPage } from "@/components/form";
import { createCustomerFromEditorAction, createProductFromEditorAction } from "../../../catalog-actions";
import { TaxpayerFrame } from "@/components/taxpayer-frame";
import { getDatabase } from "@/lib/server/db";
import { requireTaxpayer } from "@/lib/server/session";
import { saveDraftAction } from "../../actions";
import { editorData, editorInitial, invoicesPath } from "../../editor-data";
import { InvoiceEditor } from "../../invoice-editor";

export const metadata: Metadata = { title: "Editar factura" };

export default streamedPage("Cargando el borrador…", EditInvoice, "frame");

type Params = PageProps<"/[organizacion]/contribuyentes/[contribuyente]/facturas/[factura]/editar">["params"];

async function EditInvoice({ params }: { readonly params: Params }) {
  const { organizacion, contribuyente, factura } = await params;
  const detailPath = `${invoicesPath(organizacion, contribuyente)}/${factura}`;
  const { user, context, taxpayer } = await requireTaxpayer(organizacion, contribuyente, `${detailPath}/editar`);
  const invoice = await getInvoice(getDatabase(), context, factura);
  if (invoice === null) notFound();
  // Una factura emitida es inalterable: se vuelve a su ficha (desde allí se rectifica).
  if (invoice.status !== "DRAFT") redirect(detailPath);
  const [{ customers, products }, settings] = await Promise.all([editorData(context), getBillingSettings(getDatabase(), context)]);

  return (
    <TaxpayerFrame user={user} context={context} taxpayer={taxpayer} current="borradores">
      <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[1.75rem]">{invoice.kind === "RECTIFYING" ? "Editar rectificativa" : "Editar borrador"}</h1>
      <InvoiceEditor
        action={saveDraftAction.bind(null, context.tenant.slug, taxpayer.id, invoice.id)}
        customers={customers}
        products={products}
        createCustomer={context.permissions.has("customers.write") ? createCustomerFromEditorAction.bind(null, context.tenant.slug, taxpayer.id) : undefined}
        createProduct={context.permissions.has("products.write") ? createProductFromEditorAction.bind(null, context.tenant.slug, taxpayer.id) : undefined}
        defaultTax={settings.defaultTaxKey ?? undefined}
        newCustomerHref={`/${context.tenant.slug}/contribuyentes/${taxpayer.id}/clientes`}
        initial={editorInitial(invoice)}
        {...(invoice.kind === "RECTIFYING" ? { rectification: { number: invoice.rectifiesNumber ?? "", reason: invoice.rectificationReason ?? "" } } : {})}
      />
    </TaxpayerFrame>
  );
}
