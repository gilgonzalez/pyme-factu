import type { TaxpayerRecord, TenantContext } from "@facturalibre/tenancy";
import { BookUser, FileText, KeyRound, Package, Settings2, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "@/components/app-header";
import { SubmissionNotice } from "@/components/submission-notice";
import { TenantFrame } from "@/components/tenant-frame";
import type { SessionUser } from "@/lib/server/session";

export type TaxpayerSection = "datos" | "facturas" | "clientes" | "productos" | "registros" | "certificado";

/**
 * Marco de toda pantalla que actúa sobre un contribuyente: el contribuyente activo SIEMPRE visible (R-05)
 * y sus secciones, en el lateral. Las secciones sin permiso no se muestran.
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
  const sections: { id: TaxpayerSection; href: string; label: string; icon: ReactNode; visible: boolean }[] = [
    { id: "facturas", href: `${base}/facturas`, label: "Facturas", icon: <FileText />, visible: context.permissions.has("invoices.read") },
    { id: "clientes", href: `${base}/clientes`, label: "Clientes", icon: <BookUser />, visible: context.permissions.has("customers.read") },
    { id: "productos", href: `${base}/productos`, label: "Productos", icon: <Package />, visible: context.permissions.has("products.read") },
    { id: "registros", href: `${base}/registros`, label: "Registros VERI*FACTU", icon: <ShieldCheck />, visible: context.permissions.has("verifactu.read") },
    { id: "certificado", href: `${base}/certificado`, label: "Certificado", icon: <KeyRound />, visible: context.permissions.has("certificates.manage") },
    { id: "datos", href: base, label: "Datos", icon: <Settings2 />, visible: true },
  ];
  const aside = (
    <div className="grid gap-1.5 border-t pt-3 lg:border-t lg:pt-4">
      <div className="px-4 lg:px-2.5" aria-label="Contribuyente activo">
        <p className="text-xs text-muted-foreground">Facturando como</p>
        <p className="truncate text-sm font-semibold" title={taxpayer.legalName}>
          {taxpayer.legalName}
        </p>
        <p className="font-mono text-xs text-muted-foreground">NIF {taxpayer.nif}</p>
      </div>
      <nav aria-label="Secciones del contribuyente" className="overflow-x-auto px-4 lg:overflow-visible lg:p-0">
        <ul className="flex gap-1 lg:grid lg:gap-0.5">
          {sections
            .filter((section) => section.visible)
            .map((section) => (
              <li key={section.id}>
                <NavLink href={section.href} current={section.id === current} icon={section.icon}>
                  {section.label}
                </NavLink>
              </li>
            ))}
        </ul>
      </nav>
    </div>
  );
  return (
    <TenantFrame user={user} context={context} current="contribuyentes" aside={aside}>
      <SubmissionNotice context={context} recordsHref={`${base}/registros`} />
      {children}
    </TenantFrame>
  );
}
