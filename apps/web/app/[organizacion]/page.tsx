import { effectivePermissions } from "@facturalibre/security";
import { listTaxpayers } from "@facturalibre/tenancy";
import Link from "next/link";
import { streamedPage } from "@/components/form";
import { TenantFrame } from "@/components/tenant-frame";
import { buttonVariants } from "@/components/ui/button";
import { getDatabase } from "@/lib/server/db";
import { requireTenant } from "@/lib/server/session";

export default streamedPage("Cargando la organización…", TenantHome);

/** Inicio de la organización: lo primero es elegir para quién se factura. */
async function TenantHome({ params }: { readonly params: PageProps<"/[organizacion]">["params"] }) {
  const { organizacion } = await params;
  const { user, context } = await requireTenant(organizacion, `/${organizacion}`);
  const can = (permission: Parameters<typeof context.permissions.has>[0]): boolean => context.permissions.has(permission);
  const taxpayers = can("taxpayers.read") ? await listTaxpayers(getDatabase(), context) : [];
  const base = `/${context.tenant.slug}/contribuyentes`;

  return (
    <TenantFrame user={user} context={context} current="inicio">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[1.75rem]">{context.tenant.name}</h1>
        <p className="text-muted-foreground">Hola, {user.name}.</p>
      </div>

      {taxpayers.length === 0 ? (
        <section className="surface grid justify-items-start gap-3 p-8">
          <h2 className="text-lg font-semibold">Empieza por el contribuyente</h2>
          <p className="max-w-prose text-muted-foreground">
            Es la persona o empresa que emite las facturas: tú, si eres autónomo, o tu sociedad. Con su NIF, FacturaLibre numera sus facturas y genera sus
            registros VERI*FACTU.
          </p>
          {can("taxpayers.create") ? (
            <Link href={base} className={buttonVariants({ size: "lg" })}>
              Dar de alta un contribuyente
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">Aún no tienes acceso a ningún contribuyente. Pídeselo a quien administra la organización.</p>
          )}
        </section>
      ) : (
        <section aria-labelledby="facturar" className="grid gap-3">
          <h2 id="facturar" className="text-lg font-semibold">
            ¿Para quién facturas?
          </h2>
          <ul className="grid gap-3 md:grid-cols-2" aria-label="Contribuyentes">
            {taxpayers.map((taxpayer) => (
              <li key={taxpayer.id} className="surface grid gap-4 p-5">
                <div className="grid gap-0.5">
                  <p className="text-lg leading-snug font-bold">{taxpayer.legalName}</p>
                  <p className="font-mono text-sm">NIF {taxpayer.nif}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {effectivePermissions(context.membership.role, taxpayer.access).has("invoices.draft") ? (
                    <Link href={`${base}/${taxpayer.id}/facturas/nueva`} className={buttonVariants()}>
                      Nueva factura
                    </Link>
                  ) : null}
                  <Link href={`${base}/${taxpayer.id}/facturas`} className={buttonVariants({ variant: "outline" })}>
                    Ver facturas
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {can("members.read") ? (
        <section className="grid gap-1 border-t pt-6">
          <h2 className="text-sm font-semibold">Equipo</h2>
          <p className="text-muted-foreground">
            Invita a tu gestoría o a tus empleados y decide qué puede hacer cada uno.{" "}
            <Link href={`/${context.tenant.slug}/equipo`} className="font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary">
              Gestionar el equipo
            </Link>
          </p>
        </section>
      ) : null}
    </TenantFrame>
  );
}
