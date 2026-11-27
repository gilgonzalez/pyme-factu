import { formatDecimal, SCALE } from "@facturalibre/fiscal-core";
import { getBillingSettings } from "@facturalibre/tenancy";
import type { Metadata } from "next";
import { streamedPage } from "@/components/form";
import { createCustomerFromEditorAction, createProductFromEditorAction } from "../../catalog-actions";
import { TaxpayerFrame } from "@/components/taxpayer-frame";
import { getDatabase } from "@/lib/server/db";
import { requireTaxpayer } from "@/lib/server/session";
import { saveDraftAction } from "../actions";
import { editorData, invoicesPath } from "../editor-data";
import { InvoiceEditor } from "../invoice-editor";

export const metadata: Metadata = { title: "Nueva factura" };

export default streamedPage("Preparando la factura…", NewInvoice, "frame");

async function NewInvoice({ params }: { readonly params: PageProps<"/[organizacion]/contribuyentes/[contribuyente]/facturas/nueva">["params"] }) {
  const { organizacion, contribuyente } = await params;
  const { user, context, taxpayer } = await requireTaxpayer(organizacion, contribuyente, `${invoicesPath(organizacion, contribuyente)}/nueva`);
  const [{ customers, products }, settings] = await Promise.all([editorData(context), getBillingSettings(getDatabase(), context)]);
  // Valores por defecto de la configuración de la empresa.
  const withholding = settings.defaultWithholdingPercent === null ? "" : formatDecimal(BigInt(settings.defaultWithholdingPercent), SCALE.percent);

  return (
    <TaxpayerFrame user={user} context={context} taxpayer={taxpayer} current="nueva">
      <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[1.75rem]">Nueva factura</h1>
      <InvoiceEditor
        action={saveDraftAction.bind(null, context.tenant.slug, taxpayer.id, null)}
        customers={customers}
        products={products}
        initial={{ customerId: "", withholdingPercent: withholding, notes: "", lines: [] }}
        defaultTax={settings.defaultTaxKey ?? undefined}
        createCustomer={context.permissions.has("customers.write") ? createCustomerFromEditorAction.bind(null, context.tenant.slug, taxpayer.id) : undefined}
        createProduct={context.permissions.has("products.write") ? createProductFromEditorAction.bind(null, context.tenant.slug, taxpayer.id) : undefined}
        newCustomerHref={`/${context.tenant.slug}/contribuyentes/${taxpayer.id}/clientes`}
      />
    </TaxpayerFrame>
  );
}
