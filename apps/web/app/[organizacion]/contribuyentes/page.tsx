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
        <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[1.75rem]">Contribuyentes</h1>
        <p className="text-muted-foreground">
          Las personas o empresas en cuyo nombre se emiten facturas. Cada una tiene su propio NIF y su propia numeración.
        </p>
      </div>

      {taxpayers.length > 1 ? (
        <FormAlert tone="success">
          Hay {taxpayers.length} contribuyentes: antes de facturar, comprueba siempre cuál está activo: aparece en el lateral, en «Facturando como».
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
                className="surface flex flex-wrap items-center justify-between gap-3 p-5 hover:bg-accent/40"
              >
                <span className="grid">
                  <span className="font-semibold">{taxpayer.legalName}</span>
                  <span className="text-sm text-muted-foreground">
                    <span className="font-mono text-foreground">NIF {taxpayer.nif}</span>, {PERSON_TYPE[taxpayer.personType].toLowerCase()}
                    {taxpayer.tradeName === null ? "" : `, nombre comercial «${taxpayer.tradeName}»`}
                  </span>
                </span>
                <span className="rounded-sm bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                  {taxpayer.access === "FULL" ? "Acceso completo" : "Solo lectura"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {context.permissions.has("taxpayers.create") ? (
        <section aria-labelledby="nuevo" className="grid gap-3 surface p-5">
          <h2 id="nuevo" className="font-semibold">
            Dar de alta un contribuyente
          </h2>
          <TaxpayerForm action={createTaxpayerAction.bind(null, context.tenant.slug)} withNif />
        </section>
      ) : null}
    </TenantFrame>
  );
}
