import type { TaxpayerRecord, TenantContext } from "@facturalibre/tenancy";
import type { ReactNode } from "react";
import { RememberTaxpayer } from "@/components/remember-taxpayer";
import { SubmissionNotice } from "@/components/submission-notice";
import { TaxpayerSidebar, type TaxpayerSection } from "@/components/taxpayer-sidebar";
import { TenantFrame } from "@/components/tenant-frame";
import type { SessionUser } from "@/lib/server/session";

export type { TaxpayerSection } from "@/components/taxpayer-sidebar";

/**
 * Marco de toda pantalla que actúa sobre un contribuyente: el contribuyente activo SIEMPRE visible (R-05)
 * y sus secciones, en el lateral. Las secciones sin permiso no se muestran. Lo recuerda como contribuyente
 * de trabajo, para que las pantallas de la organización sigan mostrando sus secciones.
 */
export function TaxpayerFrame({
  user,
  context,
  taxpayer,
  current,
  children,
}: {
  readonly user: SessionUser;
  readonly context: TenantContext;
  readonly taxpayer: TaxpayerRecord;
  readonly current: TaxpayerSection;
  readonly children: ReactNode;
}) {
  const aside = <TaxpayerSidebar slug={context.tenant.slug} taxpayer={taxpayer} permissions={context.permissions} current={current} />;
  return (
    <TenantFrame user={user} context={context} current="contribuyentes" aside={aside}>
      <RememberTaxpayer tenantId={context.tenant.id} taxpayerId={taxpayer.id} />
      <SubmissionNotice context={context} recordsHref={`/${context.tenant.slug}/contribuyentes/${taxpayer.id}/registros`} />
      {children}
    </TenantFrame>
  );
}
