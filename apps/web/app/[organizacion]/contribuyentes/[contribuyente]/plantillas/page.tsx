import { formatAmount } from "@facturalibre/fiscal-core";
import { listInvoiceTemplates } from "@facturalibre/tenancy";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { streamedPage } from "@/components/form";
import { TaxpayerFrame } from "@/components/taxpayer-frame";
import { buttonVariants } from "@/components/ui/button";
import { getDatabase } from "@/lib/server/db";
import { requireTaxpayer } from "@/lib/server/session";
import { invoicesPath } from "../facturas/editor-data";
import { deleteTemplateAction } from "./actions";

export const metadata: Metadata = { title: "Plantillas" };

export default streamedPage("Cargando las plantillas…", Templates, "frame");

const lineCount = (count: number): string => `${String(count)} ${count === 1 ? "línea" : "líneas"}`;

/**
 * Plantillas: facturas que se repiten (mantenimientos, cuotas, clases…) guardadas con un nombre. «Usar» prepara una
 * factura nueva con sus datos para cambiar lo que haga falta (cliente, cantidades, líneas); la plantilla no cambia.
 */
async function Templates({ params }: { readonly params: PageProps<"/[organizacion]/contribuyentes/[contribuyente]/plantillas">["params"] }) {
  const { organizacion, contribuyente } = await params;
  const path = `/${organizacion}/contribuyentes/${contribuyente}/plantillas`;
  const { user, context, taxpayer } = await requireTaxpayer(organizacion, contribuyente, path);
  const templates = await listInvoiceTemplates(getDatabase(), context);
  const canWrite = context.permissions.has("invoices.draft");

  return (
    <TaxpayerFrame user={user} context={context} taxpayer={taxpayer} current="plantillas">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[1.75rem]">Plantillas</h1>
          <p className="text-sm text-muted-foreground">
            Las facturas que repites, con un nombre para encontrarlas. Al usar una, cambias lo que haga falta y la plantilla queda igual.
          </p>
        </div>
        {canWrite ? (
          <Link href={`${path}/nueva`} className={buttonVariants()}>
            <Plus aria-hidden="true" />
            Nueva plantilla
          </Link>
        ) : null}
      </div>

      {templates.length === 0 ? (
        <div className="surface grid justify-items-start gap-2 p-8">
          <h2 className="font-semibold">Aún no tienes plantillas</h2>
          <p className="text-muted-foreground">
            Crea una desde aquí o, en cualquier factura o borrador, pulsa «Guardar como plantilla». Después podrás empezar una factura desde ella con un
            toque.
          </p>
        </div>
      ) : (
        <ul className="surface grid divide-y" aria-label="Plantillas">
          {templates.map((template) => (
            <li key={template.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4">
              <span className="grid min-w-0">
                <span className="font-medium">{template.name}</span>
                <span className="figures text-sm text-muted-foreground">
                  {template.customerName ?? "Sin cliente (se elige al facturar)"} · {lineCount(template.lineCount)} ·{" "}
                  <span className="whitespace-nowrap">{formatAmount(template.total)}</span>
                </span>
              </span>
              {canWrite ? (
                <span className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`${invoicesPath(organizacion, contribuyente)}/nueva?plantilla=${template.id}`}
                    className={buttonVariants({ size: "sm" })}
                    aria-label={`Usar la plantilla ${template.name}`}
                  >
                    Usar
                  </Link>
                  <Link href={`${path}/${template.id}`} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label={`Editar la plantilla ${template.name}`}>
                    Editar
                  </Link>
                  <ActionButton
                    action={deleteTemplateAction.bind(null, organizacion, contribuyente, template.id)}
                    label={`Borrar la plantilla ${template.name}`}
                    idle="Borrar"
                    busy="Borrando…"
                    variant="destructive"
                  />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </TaxpayerFrame>
  );
}
