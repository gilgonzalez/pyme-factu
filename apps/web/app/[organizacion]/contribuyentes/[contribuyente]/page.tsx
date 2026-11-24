import { listTaxpayerAccess } from "@facturalibre/tenancy";
import type { Metadata } from "next";
import Link from "next/link";
import { streamedPage } from "@/components/form";
import { TaxpayerFrame } from "@/components/taxpayer-frame";
import { getDatabase } from "@/lib/server/db";
import { requireTaxpayer } from "@/lib/server/session";
import { setTaxpayerAccessAction, updateTaxpayerAction } from "../actions";
import { AccessManager, TaxpayerForm } from "../taxpayer-forms";

export const metadata: Metadata = { title: "Contribuyente" };

export default streamedPage("Cargando el contribuyente…", Taxpayer);

type Params = PageProps<"/[organizacion]/contribuyentes/[contribuyente]">["params"];

async function Taxpayer({ params }: { readonly params: Params }) {
  const { organizacion, contribuyente } = await params;
  const path = `/${organizacion}/contribuyentes/${contribuyente}`;
  // El contribuyente se verifica al resolver el contexto: si no existe o no hay acceso → 404.
  const { user, context, taxpayer } = await requireTaxpayer(organizacion, contribuyente, path);
  const db = getDatabase();
  const canManageAccess = context.permissions.has("taxpayers.manage_access");
  const access = canManageAccess ? await listTaxpayerAccess(db, context, taxpayer.id) : [];
  const slug = context.tenant.slug;

  return (
    <TaxpayerFrame user={user} context={context} taxpayer={taxpayer} current="datos">
      <div className="grid gap-1">
        <Link href={`/${slug}/contribuyentes`} className="text-sm text-muted-foreground underline underline-offset-4">
          Volver a contribuyentes
        </Link>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{taxpayer.legalName}</h1>
        <p className="text-muted-foreground">
          NIF {taxpayer.nif} · {taxpayer.personType === "LEGAL_ENTITY" ? "Persona jurídica o entidad" : "Persona física"} · tu acceso:{" "}
          {taxpayer.access === "FULL" ? "completo" : "solo lectura"}
        </p>
      </div>

      <section aria-labelledby="datos" className="grid gap-3 rounded-xl border p-4">
        <h2 id="datos" className="font-medium">
          Datos fiscales
        </h2>
        {context.permissions.has("taxpayers.update") ? (
          <TaxpayerForm action={updateTaxpayerAction.bind(null, slug, taxpayer.id)} values={taxpayer} withNif={false} />
        ) : (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {[
              ["Nombre comercial", taxpayer.tradeName],
              ["Email de facturación", taxpayer.email],
              ["Dirección", taxpayer.addressLine],
              ["Código postal", taxpayer.postalCode],
              ["Municipio", taxpayer.city],
              ["Provincia", taxpayer.province],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="text-sm text-muted-foreground">El NIF no se puede cambiar: si es otro, da de alta otro contribuyente.</p>
      </section>

      {canManageAccess ? (
        <section aria-labelledby="accesos" className="grid gap-3">
          <h2 id="accesos" className="font-medium">
            Quién puede trabajar con este contribuyente
          </h2>
          <AccessManager
            rows={access.map((entry) => ({ ...entry, isMe: entry.membershipId === context.membership.id }))}
            action={setTaxpayerAccessAction.bind(null, slug, taxpayer.id)}
          />
        </section>
      ) : null}
    </TaxpayerFrame>
  );
}
