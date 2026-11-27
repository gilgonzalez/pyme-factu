import "server-only";
// Pantallas «Nueva plantilla» y «Editar plantilla»: el mismo editor que las facturas, en modo plantilla.
import { getBillingSettings, getInvoice, getInvoiceTemplate, type TaxpayerRecord, type TenantContext } from "@facturalibre/tenancy";
import { notFound } from "next/navigation";
import { TaxpayerFrame } from "@/components/taxpayer-frame";
import { getDatabase } from "@/lib/server/db";
import { requireTaxpayer, type SessionUser } from "@/lib/server/session";
import { createCustomerFromEditorAction, createProductFromEditorAction } from "../catalog-actions";
import { editorData, editorInitial } from "../facturas/editor-data";
import { InvoiceEditor, type InvoiceEditorProps } from "../facturas/invoice-editor";
import { saveTemplateAction } from "./actions";

const EMPTY: InvoiceEditorProps["initial"] = { customerId: "", withholdingPercent: "", notes: "", lines: [] };

type Base = PageProps<"/[organizacion]/contribuyentes/[contribuyente]/plantillas/nueva">;
type Edit = PageProps<"/[organizacion]/contribuyentes/[contribuyente]/plantillas/[plantilla]">;

/** Plantilla nueva: vacía o, con ?desde=<factura>, copiando el cliente, las líneas y la retención de esa factura. */
export async function NewTemplatePage({ params, searchParams }: { readonly params: Base["params"]; readonly searchParams: Base["searchParams"] }) {
  const { organizacion, contribuyente } = await params;
  const { desde } = await searchParams;
  const session = await requireTaxpayer(organizacion, contribuyente, `/${organizacion}/contribuyentes/${contribuyente}/plantillas/nueva`);
  const source = typeof desde === "string" ? await getInvoice(getDatabase(), session.context, desde) : null;
  const intro = source === null ? null : `Con los datos de la factura para ${source.customerName}. Ponle un nombre y ajusta lo que quieras.`;
  return <TemplateScreen {...session} origin={`desde:${source?.id ?? "nada"}`} heading="Nueva plantilla" intro={intro} templateId={null} name="" initial={source === null ? EMPTY : editorInitial(source)} />;
}

export async function EditTemplatePage({ params }: { readonly params: Edit["params"] }) {
  const { organizacion, contribuyente, plantilla } = await params;
  const session = await requireTaxpayer(organizacion, contribuyente, `/${organizacion}/contribuyentes/${contribuyente}/plantillas/${plantilla}`);
  const template = await getInvoiceTemplate(getDatabase(), session.context, plantilla);
  if (template === null) notFound();
  return <TemplateScreen {...session} origin={`plantilla:${template.id}`} heading="Editar plantilla" intro={null} templateId={template.id} name={template.name} initial={editorInitial(template)} />;
}

async function TemplateScreen({
  user,
  context,
  taxpayer,
  heading,
  intro,
  templateId,
  name,
  initial,
  origin,
}: {
  readonly user: SessionUser;
  readonly context: TenantContext;
  readonly taxpayer: TaxpayerRecord;
  readonly heading: string;
  readonly intro: string | null;
  readonly templateId: string | null;
  readonly name: string;
  readonly initial: InvoiceEditorProps["initial"];
  /** De qué parte el editor (factura de origen o plantilla): si cambia, se monta de nuevo con esos datos. */
  readonly origin: string;
}) {
  const slug = context.tenant.slug;
  const [{ customers, products }, settings] = await Promise.all([editorData(context), getBillingSettings(getDatabase(), context)]);
  return (
    <TaxpayerFrame user={user} context={context} taxpayer={taxpayer} current="plantillas">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[1.75rem]">{heading}</h1>
        {intro === null ? null : <p className="text-sm text-muted-foreground">{intro}</p>}
      </div>
      {/* Next conserva las pantallas visitadas con su estado: sin esta clave, «Guardar como plantilla» desde otra
          factura mostraría lo que quedó escrito la vez anterior. */}
      <InvoiceEditor
        key={origin}
        template={{ name }}
        action={saveTemplateAction.bind(null, slug, taxpayer.id, templateId)}
        customers={customers}
        products={products}
        initial={initial}
        defaultTax={settings.defaultTaxKey ?? undefined}
        createCustomer={context.permissions.has("customers.write") ? createCustomerFromEditorAction.bind(null, slug, taxpayer.id) : undefined}
        createProduct={context.permissions.has("products.write") ? createProductFromEditorAction.bind(null, slug, taxpayer.id) : undefined}
        newCustomerHref={`/${slug}/contribuyentes/${taxpayer.id}/clientes`}
      />
    </TaxpayerFrame>
  );
}
