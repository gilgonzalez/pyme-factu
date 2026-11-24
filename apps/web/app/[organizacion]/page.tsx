import Link from "next/link";
import { Streamed } from "@/components/form";
import { TenantFrame } from "@/components/tenant-frame";
import { buttonVariants } from "@/components/ui/button";
import { requireTenant } from "@/lib/server/session";

export default function TenantHomePage({ params }: PageProps<"/[organizacion]">) {
  return (
    <Streamed message="Cargando la organización…">
      <TenantHome params={params} />
    </Streamed>
  );
}

async function TenantHome({ params }: { readonly params: PageProps<"/[organizacion]">["params"] }) {
  const { organizacion } = await params;
  const { user, context } = await requireTenant(organizacion, `/${organizacion}`);
  return (
    <TenantFrame user={user} context={context} current="inicio">
      <div className="grid gap-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{context.tenant.name}</h1>
        <p className="text-muted-foreground">Hola, {user.name}. Este es el inicio de tu organización.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="grid gap-2 rounded-xl border p-4">
          <h2 className="font-medium">Contribuyentes y facturas</h2>
          <p className="text-sm text-muted-foreground">
            El alta de contribuyentes, clientes y facturas llega en la siguiente fase. FacturaLibre todavía no emite facturas ni
            registros de facturación.
          </p>
        </section>
        {context.permissions.has("members.read") ? (
          <section className="grid gap-2 rounded-xl border p-4">
            <h2 className="font-medium">Equipo</h2>
            <p className="text-sm text-muted-foreground">Invita a tu gestoría o a tus empleados y decide qué puede hacer cada uno.</p>
            <Link href={`/${context.tenant.slug}/equipo`} className={buttonVariants({ variant: "outline" })}>
              Gestionar el equipo
            </Link>
          </section>
        ) : null}
      </div>
    </TenantFrame>
  );
}
