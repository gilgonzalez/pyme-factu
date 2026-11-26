import { listCustomers } from "@facturalibre/tenancy";
import type { Metadata } from "next";
import { streamedPage } from "@/components/form";
import { PartyForm } from "@/components/party-form";
import { TaxpayerFrame } from "@/components/taxpayer-frame";
import { getDatabase } from "@/lib/server/db";
import { requireTaxpayer } from "@/lib/server/session";
import { createCustomerAction } from "../catalog-actions";

export const metadata: Metadata = { title: "Clientes" };

export default streamedPage("Cargando los clientes…", Customers, "frame");

async function Customers({ params }: { readonly params: PageProps<"/[organizacion]/contribuyentes/[contribuyente]/clientes">["params"] }) {
  const { organizacion, contribuyente } = await params;
  const { user, context, taxpayer } = await requireTaxpayer(organizacion, contribuyente, `/${organizacion}/contribuyentes/${contribuyente}/clientes`);
  const customers = await listCustomers(getDatabase(), context);

  return (
    <TaxpayerFrame user={user} context={context} taxpayer={taxpayer} current="clientes">
      <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[1.75rem]">Clientes</h1>
      {customers.length === 0 ? (
        <p className="text-muted-foreground">Aún no hay clientes. Da de alta el primero para poder facturarle.</p>
      ) : (
        <ul className="surface grid divide-y" aria-label="Clientes">
          {customers.map((customer) => (
            <li key={customer.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
              <span className="grid">
                <span className="font-medium">{customer.legalName}</span>
                <span className="text-sm text-muted-foreground">
                  {customer.nif === null ? "Sin NIF" : `NIF ${customer.nif}`}
                  {customer.city === null ? "" : `, ${customer.city}`}
                </span>
              </span>
              {customer.equivalenceSurcharge ? <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs">Recargo de equivalencia</span> : null}
            </li>
          ))}
        </ul>
      )}
      {context.permissions.has("customers.write") ? (
        <section aria-labelledby="nuevo-cliente" className="grid gap-3 surface p-5">
          <h2 id="nuevo-cliente" className="font-semibold">
            Nuevo cliente
          </h2>
          <PartyForm
            action={createCustomerAction.bind(null, context.tenant.slug, taxpayer.id)}
            nif="optional"
            withSurcharge
            label="Nuevo cliente"
            submitLabel="Guardar cliente"
            pendingLabel="Guardando…"
          />
        </section>
      ) : null}
    </TaxpayerFrame>
  );
}
