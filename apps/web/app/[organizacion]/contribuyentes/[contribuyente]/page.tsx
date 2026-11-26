import { formatIban } from "@facturalibre/domain";
import { formatDecimal, SCALE } from "@facturalibre/fiscal-core";
import { getBillingSettings, listTaxpayerAccess, type BillingSettingsView } from "@facturalibre/tenancy";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { streamedPage } from "@/components/form";
import { TaxpayerFrame } from "@/components/taxpayer-frame";
import { taxLabel } from "@/lib/invoicing";
import { getDatabase } from "@/lib/server/db";
import { requireTaxpayer } from "@/lib/server/session";
import { deleteLogoAction, setTaxpayerAccessAction, updateBillingSettingsAction, updateTaxpayerAction, uploadLogoAction } from "../actions";
import { AccessManager, TaxpayerForm } from "../taxpayer-forms";
import { BillingSettingsForm, LogoForm, type BillingSettingsValues } from "./company-forms";

export const metadata: Metadata = { title: "Empresa" };

export default streamedPage("Cargando los datos de la empresa…", Company);

type Params = PageProps<"/[organizacion]/contribuyentes/[contribuyente]">["params"];

/** Configuración guardada → valores de los campos del formulario. */
function settingsValues(settings: BillingSettingsView): BillingSettingsValues {
  return {
    iban: settings.iban === null ? "" : formatIban(settings.iban),
    paymentInstructions: settings.paymentInstructions ?? "",
    paymentTermsDays: settings.paymentTermsDays === null ? "" : String(settings.paymentTermsDays),
    defaultWithholdingPercent: settings.defaultWithholdingPercent === null ? "" : formatDecimal(BigInt(settings.defaultWithholdingPercent), SCALE.percent),
    defaultTaxKey: settings.defaultTaxKey ?? "",
    footerNote: settings.footerNote ?? "",
    emailMessage: settings.emailMessage ?? "",
  };
}

function Section({ id, title, description, children }: { readonly id: string; readonly title: string; readonly description: string; readonly children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="surface grid gap-4 p-5 sm:p-6">
      <div className="grid gap-0.5">
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

/** Para quien solo puede consultar: los datos en una lista. */
function ReadOnly({ rows }: { readonly rows: readonly (readonly [string, string | null])[] }) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="whitespace-pre-line">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

async function Company({ params }: { readonly params: Params }) {
  const { organizacion, contribuyente } = await params;
  const path = `/${organizacion}/contribuyentes/${contribuyente}`;
  // El contribuyente se verifica al resolver el contexto: si no existe o no hay acceso → 404.
  const { user, context, taxpayer } = await requireTaxpayer(organizacion, contribuyente, path);
  const db = getDatabase();
  const canManageAccess = context.permissions.has("taxpayers.manage_access");
  const canEdit = context.permissions.has("taxpayers.update");
  const [access, settings] = await Promise.all([canManageAccess ? listTaxpayerAccess(db, context, taxpayer.id) : [], getBillingSettings(db, context)]);
  const slug = context.tenant.slug;
  const values = settingsValues(settings);
  // La vista previa del logo se pide de nuevo tras cada cambio.
  const logoUrl = settings.logoVersion === null ? null : `${path}/logo?v=${settings.logoVersion}`;

  return (
    <TaxpayerFrame user={user} context={context} taxpayer={taxpayer} current="datos">
      <div className="grid gap-1">
        <Link href={`/${slug}/contribuyentes`} className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline">
          Volver a contribuyentes
        </Link>
        <p className="mt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Empresa</p>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[1.75rem]">{taxpayer.legalName}</h1>
        <p className="text-muted-foreground">
          NIF {taxpayer.nif}, {taxpayer.personType === "LEGAL_ENTITY" ? "persona jurídica o entidad" : "persona física"}; tu acceso:{" "}
          {taxpayer.access === "FULL" ? "completo" : "solo lectura"}. Lo que configures aquí sale en tus borradores y facturas; las ya emitidas
          conservan los datos que tenían.
        </p>
      </div>

      <Section id="datos" title="Datos fiscales y de contacto" description="Emisor de tus facturas. El NIF no se puede cambiar: si es otro, da de alta otro contribuyente.">
        {canEdit ? (
          <TaxpayerForm action={updateTaxpayerAction.bind(null, slug, taxpayer.id)} values={taxpayer} withNif={false} />
        ) : (
          <ReadOnly
            rows={[
              ["Nombre comercial", taxpayer.tradeName],
              ["Email de facturación", taxpayer.email],
              ["Teléfono", taxpayer.phone],
              ["Web", taxpayer.website],
              ["Dirección", [taxpayer.addressLine, [taxpayer.postalCode, taxpayer.city].filter(Boolean).join(" "), taxpayer.province].filter(Boolean).join(", ") || null],
              ["Datos registrales", taxpayer.registryInfo],
            ]}
          />
        )}
      </Section>

      <Section id="logo" title="Logo" description="Da imagen a tus documentos.">
        {canEdit ? (
          <LogoForm upload={uploadLogoAction.bind(null, slug, taxpayer.id)} remove={deleteLogoAction.bind(null, slug, taxpayer.id)} logoUrl={logoUrl} />
        ) : logoUrl === null ? (
          <p className="text-sm text-muted-foreground">Sin logo.</p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- imagen privada servida por la propia app
          <img src={logoUrl} alt="Logo de la empresa" className="max-h-24 w-fit object-contain" />
        )}
      </Section>

      <Section id="facturacion" title="Cobro y facturas" description="Forma de pago, vencimiento y valores con los que empieza cada factura.">
        {canEdit ? (
          <BillingSettingsForm action={updateBillingSettingsAction.bind(null, slug, taxpayer.id)} values={values} />
        ) : (
          <ReadOnly
            rows={[
              ["IBAN", values.iban || null],
              ["Plazo de pago", settings.paymentTermsDays === null ? null : `${values.paymentTermsDays} días`],
              ["Otras instrucciones de pago", settings.paymentInstructions],
              ["Retención IRPF por defecto", settings.defaultWithholdingPercent === null ? null : `${values.defaultWithholdingPercent} %`],
              ["IVA de las líneas nuevas", taxLabel(settings.defaultTaxKey ?? "VAT:2100")],
              ["Pie de factura", settings.footerNote],
              ["Mensaje al enviar por email", settings.emailMessage],
            ]}
          />
        )}
      </Section>

      {canManageAccess ? (
        <section aria-labelledby="accesos" className="grid gap-3">
          <h2 id="accesos" className="font-semibold">
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
