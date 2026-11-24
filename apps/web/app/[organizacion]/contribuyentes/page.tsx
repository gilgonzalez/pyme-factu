import { listTaxpayers } from "@facturalibre/tenancy";
import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert, streamedPage } from "@/components/form";
import { TenantFrame } from "@/components/tenant-frame";
import { getDatabase } from "@/lib/server/db";
import { requireTenant } from "@/lib/server/session";
import { createTaxpayerAction } from "./actions";
import { TaxpayerForm } from "./taxpayer-forms";

export const metadata: Metadata = { title: "Contribuyentes" };

export default streamedPage("Cargando los contribuyentes…", Taxpayers);

const PERSON_TYPE = { NATURAL_PERSON: "Persona física", LEGAL_ENTITY: "Persona jurídica o entidad" } as const;

async function Taxpayers({ params }: { readonly params: PageProps<"/[organizacion]/contribuyentes">["params"] }) {
  const { organizacion } = await params;
  const { user, context } = await requireTenant(organizacion, `/${organizacion}/contribuyentes`);
  const taxpayers = context.permissions.has("taxpayers.read") ? await listTaxpayers(getDatabase(), context) : [];
  const base = `/${context.tenant.slug}/contribuyentes`;

  return (
    <TenantFrame user={user} context={context} current="contribuyentes">
      <div className="grid gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Contribuyentes</h1>
        <p className="text-muted-foreground">
          Las personas o empresas en cuyo nombre se emiten facturas. Cada una tiene su propio NIF y su propia numeración.
        </p>
      </div>

      {taxpayers.length > 1 ? (
        <FormAlert tone="success">
          Hay {taxpayers.length} contribuyentes: antes de facturar, comprueba siempre cuál está activo en la barra superior.
        </FormAlert>
      ) : null}

      {taxpayers.length === 0 ? (
        <p className="text-muted-foreground">Todavía no hay contribuyentes a los que tengas acceso.</p>
      ) : (
        <ul className="grid gap-3" aria-label="Contribuyentes">
          {taxpayers.map((taxpayer) => (
            <li key={taxpayer.id}>
              <Link
                href={`${base}/${taxpayer.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="grid">
                  <span className="font-medium">{taxpayer.legalName}</span>
                  <span className="text-sm text-muted-foreground">
                    NIF {taxpayer.nif} · {PERSON_TYPE[taxpayer.personType]}
                    {taxpayer.tradeName === null ? "" : ` · ${taxpayer.tradeName}`}
                  </span>
                </span>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                  {taxpayer.access === "FULL" ? "Acceso completo" : "Solo lectura"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {context.permissions.has("taxpayers.create") ? (
        <section aria-labelledby="nuevo" className="grid gap-3 rounded-xl border p-4">
          <h2 id="nuevo" className="font-medium">
            Dar de alta un contribuyente
          </h2>
          <TaxpayerForm action={createTaxpayerAction.bind(null, context.tenant.slug)} withNif />
        </section>
      ) : null}
    </TenantFrame>
  );
}
