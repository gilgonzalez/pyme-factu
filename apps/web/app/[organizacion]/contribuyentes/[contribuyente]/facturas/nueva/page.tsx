import { formatDecimal, SCALE } from "@facturalibre/fiscal-core";
import { getBillingSettings, getInvoiceTemplate, listInvoiceTemplates, type InvoiceTemplateSummary } from "@facturalibre/tenancy";
import { LayoutTemplate } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { streamedPage } from "@/components/form";
import { createCustomerFromEditorAction, createProductFromEditorAction } from "../../catalog-actions";
import { TaxpayerFrame } from "@/components/taxpayer-frame";
import { getDatabase } from "@/lib/server/db";
import { requireTaxpayer } from "@/lib/server/session";
import { saveDraftAction } from "../actions";
import { editorData, editorInitial, invoicesPath } from "../editor-data";
import { InvoiceEditor } from "../invoice-editor";

export const metadata: Metadata = { title: "Nueva factura" };

export default streamedPage("Preparando la factura…", NewInvoice, "frame");

type Props = PageProps<"/[organizacion]/contribuyentes/[contribuyente]/facturas/nueva">;

/** Factura nueva: vacía (con los valores por defecto de la empresa) o, con ?plantilla=<id>, con los de esa plantilla. */
async function NewInvoice({ params, searchParams }: { readonly params: Props["params"]; readonly searchParams: Props["searchParams"] }) {
  const { organizacion, contribuyente } = await params;
  const { plantilla } = await searchParams;
  const path = `${invoicesPath(organizacion, contribuyente)}/nueva`;
  const { user, context, taxpayer } = await requireTaxpayer(organizacion, contribuyente, path);
  const db = getDatabase();
  const [{ customers, products }, settings, templates, template] = await Promise.all([
    editorData(context),
    getBillingSettings(db, context),
    listInvoiceTemplates(db, context),
    typeof plantilla === "string" ? getInvoiceTemplate(db, context, plantilla) : null,
  ]);
  // Valores por defecto de la configuración de la empresa.
  const withholding = settings.defaultWithholdingPercent === null ? "" : formatDecimal(BigInt(settings.defaultWithholdingPercent), SCALE.percent);

  return (
    <TaxpayerFrame user={user} context={context} taxpayer={taxpayer} current="nueva">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[1.75rem]">Nueva factura</h1>
        {template === null ? null : (
          <p className="text-sm text-muted-foreground">
            Desde la plantilla <strong className="font-medium text-foreground">«{template.name}»</strong>: cambia lo que haga falta; la plantilla no cambia.
          </p>
        )}
      </div>
      {/* La clave reinicia el editor al cambiar de plantilla (sus valores iniciales solo se leen al montarlo). */}
      <TemplateChooser templates={templates} current={template?.id ?? null} path={path} />
      <InvoiceEditor
        key={template?.id ?? "vacia"}
        action={saveDraftAction.bind(null, context.tenant.slug, taxpayer.id, null)}
        customers={customers}
        products={products}
        initial={template === null ? { customerId: "", withholdingPercent: withholding, notes: "", lines: [] } : editorInitial(template)}
        defaultTax={settings.defaultTaxKey ?? undefined}
        createCustomer={context.permissions.has("customers.write") ? createCustomerFromEditorAction.bind(null, context.tenant.slug, taxpayer.id) : undefined}
        createProduct={context.permissions.has("products.write") ? createProductFromEditorAction.bind(null, context.tenant.slug, taxpayer.id) : undefined}
        newCustomerHref={`/${context.tenant.slug}/contribuyentes/${taxpayer.id}/clientes`}
      />
    </TaxpayerFrame>
  );
}

/**
 * «Empezar desde una plantilla»: sus nombres a un toque, encima del editor. La elegida queda marcada; «En blanco»
 * vuelve a la factura vacía.
 */
function TemplateChooser({ templates, current, path }: { readonly templates: readonly InvoiceTemplateSummary[]; readonly current: string | null; readonly path: string }) {
  if (templates.length === 0) return null;
  const chip =
    "inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground hover:border-primary/40 hover:text-foreground aria-[current=true]:border-primary aria-[current=true]:bg-accent aria-[current=true]:text-accent-foreground";
  return (
    <nav aria-label="Empezar desde una plantilla" className="grid gap-2">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <LayoutTemplate aria-hidden="true" className="size-4 text-primary" />
        Empezar desde una plantilla
      </p>
      <ul className="-mx-1 flex gap-2 overflow-x-auto max-sm:scroll-fade-x px-1 pb-1 sm:flex-wrap sm:overflow-visible">
        <li>
          <Link href={path} aria-current={current === null} className={chip}>
            En blanco
          </Link>
        </li>
        {templates.map((template) => (
          <li key={template.id}>
            <Link href={`${path}?plantilla=${template.id}`} aria-current={current === template.id} className={chip}>
              {template.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
