import type { TaxpayerRecord, TenantContext } from "@facturalibre/tenancy";
import Link from "next/link";
import type { ReactNode } from "react";
import { SubmissionNotice } from "@/components/submission-notice";
import { TenantFrame } from "@/components/tenant-frame";
import type { SessionUser } from "@/lib/server/session";

export type TaxpayerSection = "datos" | "facturas" | "clientes" | "productos" | "registros" | "certificado";

/**
 * Marco de toda pantalla que actúa sobre un contribuyente: el contribuyente activo SIEMPRE visible (R-05)
 * y sus secciones, en un lateral (escritorio) o en una tira desplazable (móvil). Las secciones sin permiso no
 * se muestran.
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
  const base = `/${context.tenant.slug}/contribuyentes/${taxpayer.id}`;
  const sections: { id: TaxpayerSection; href: string; label: string; visible: boolean }[] = [
    { id: "facturas", href: `${base}/facturas`, label: "Facturas", visible: context.permissions.has("invoices.read") },
    { id: "clientes", href: `${base}/clientes`, label: "Clientes", visible: context.permissions.has("customers.read") },
    { id: "productos", href: `${base}/productos`, label: "Productos", visible: context.permissions.has("products.read") },
    { id: "registros", href: `${base}/registros`, label: "Registros VERI*FACTU", visible: context.permissions.has("verifactu.read") },
    { id: "certificado", href: `${base}/certificado`, label: "Certificado", visible: context.permissions.has("certificates.manage") },
    { id: "datos", href: base, label: "Datos", visible: true },
  ];
  const aside = (
    <aside className="grid min-w-0 content-start gap-3 lg:sticky lg:top-6 lg:self-start">
      <div className="sheet grid gap-0.5 p-4" aria-label="Contribuyente activo">
        <p className="text-sm text-muted-foreground">Facturando como</p>
        <p className="leading-snug font-bold">{taxpayer.legalName}</p>
        <p className="font-mono text-sm">NIF {taxpayer.nif}</p>
        {context.permissions.has("taxpayers.read") ? (
          <Link href={`/${context.tenant.slug}/contribuyentes`} className="mt-1 w-fit text-sm font-medium text-primary underline-offset-4 hover:underline">
            Cambiar de contribuyente
          </Link>
        ) : null}
      </div>
      <nav aria-label="Secciones del contribuyente" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-1 lg:grid">
          {sections
            .filter((section) => section.visible)
            .map((section) => (
              <li key={section.id}>
                <Link
                  href={section.href}
                  aria-current={section.id === current ? "page" : undefined}
                  className="block rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground hover:bg-card hover:text-foreground aria-[current=page]:bg-card aria-[current=page]:text-foreground aria-[current=page]:shadow-[inset_3px_0_0_var(--primary),0_0_0_1px_rgb(27_33_64/0.08)]"
                >
                  {section.label}
                </Link>
              </li>
            ))}
        </ul>
      </nav>
    </aside>
  );
  return (
    <TenantFrame user={user} context={context} current="contribuyentes" aside={aside}>
      <SubmissionNotice context={context} recordsHref={`${base}/registros`} />
      {children}
    </TenantFrame>
  );
}
