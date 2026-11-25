import { certificateStatus } from "@facturalibre/tenancy";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { streamedPage } from "@/components/form";
import { TaxpayerFrame } from "@/components/taxpayer-frame";
import { getDatabase } from "@/lib/server/db";
import { requireTaxpayer } from "@/lib/server/session";
import { aeatEnvironmentLabel } from "@/lib/server/verifactu";
import { deleteCertificateAction, saveCertificateAction } from "./actions";
import { CertificateForm, DeleteCertificateForm } from "./certificate-forms";

export const metadata: Metadata = { title: "Certificado electrónico" };

export default streamedPage("Cargando…", Certificate);

const dateTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Madrid" });

/** Certificado con el que se remiten los registros a la AEAT (OM HAC/1177/2024, arts. 4.b y 5). */
async function Certificate({ params }: { readonly params: PageProps<"/[organizacion]/contribuyentes/[contribuyente]/certificado">["params"] }) {
  const { organizacion, contribuyente } = await params;
  const { user, context, taxpayer } = await requireTaxpayer(organizacion, contribuyente, `/${organizacion}/contribuyentes/${contribuyente}/certificado`);
  if (!context.permissions.has("certificates.manage")) notFound();
  const status = await certificateStatus(getDatabase(), context);
  const slug = context.tenant.slug;

  return (
    <TaxpayerFrame user={user} context={context} taxpayer={taxpayer} current="certificado">
      <div className="grid gap-1">
        <h1 className="font-heading text-[1.95rem] leading-tight font-bold tracking-[-0.02em]">Certificado electrónico</h1>
        <p className="text-muted-foreground">
          Con él, FacturaLibre remite automáticamente a la AEAT los registros VERI*FACTU de {taxpayer.legalName}. Se guarda cifrado y nunca se
          muestra ni se descarga.
        </p>
        <p className="text-sm text-muted-foreground">Destino de los envíos en este servidor: {aeatEnvironmentLabel()}.</p>
      </div>
      <section aria-labelledby="estado" className="grid gap-3 sheet p-5">
        <h2 id="estado" className="text-lg font-bold">
          {status === null ? "Sin certificado" : `Certificado guardado el ${dateTime.format(status.updatedAt)}`}
        </h2>
        {status === null ? (
          <p className="text-sm text-muted-foreground">Mientras no haya certificado, los registros se quedan pendientes de remitir (se avisa en cada pantalla).</p>
        ) : (
          <DeleteCertificateForm action={deleteCertificateAction.bind(null, slug, taxpayer.id)} />
        )}
      </section>
      <section aria-labelledby="subir" className="sheet grid gap-4 p-5">
        <h2 id="subir" className="text-lg font-bold">
          {status === null ? "Subir el certificado" : "Sustituir el certificado"}
        </h2>
        <CertificateForm action={saveCertificateAction.bind(null, slug, taxpayer.id)} replacing={status !== null} />
      </section>
    </TaxpayerFrame>
  );
}
