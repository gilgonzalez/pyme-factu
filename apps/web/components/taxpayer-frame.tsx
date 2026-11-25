import type { TaxpayerRecord, TenantContext } from "@facturalibre/tenancy";
import Link from "next/link";
import type { ReactNode } from "react";
import { TenantFrame } from "@/components/tenant-frame";
import type { SessionUser } from "@/lib/server/session";

export type TaxpayerSection = "datos" | "facturas" | "clientes" | "productos" | "registros";

/**
 * Marco de toda pantalla que actúa sobre un contribuyente: el contribuyente activo SIEMPRE visible (R-05)
 * y sus secciones. Las secciones sin permiso no se muestran.
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
    { id: "datos", href: base, label: "Datos", visible: true },
    { id: "facturas", href: `${base}/facturas`, label: "Facturas", visible: context.permissions.has("invoices.read") },
    { id: "clientes", href: `${base}/clientes`, label: "Clientes", visible: context.permissions.has("customers.read") },
    { id: "productos", href: `${base}/productos`, label: "Productos", visible: context.permissions.has("products.read") },
    { id: "registros", href: `${base}/registros`, label: "Registros VERI*FACTU", visible: context.permissions.has("verifactu.read") },
  ];
  return (
    <TenantFrame user={user} context={context} current="contribuyentes" activeTaxpayer={taxpayer}>
      <nav aria-label="Secciones del contribuyente">
        <ul className="flex flex-wrap gap-2">
          {sections
            .filter((section) => section.visible)
            .map((section) => (
              <li key={section.id}>
                <Link
                  href={section.href}
                  aria-current={section.id === current ? "page" : undefined}
                  className="inline-block rounded-full border px-3 py-1 text-sm hover:bg-muted aria-[current=page]:border-foreground aria-[current=page]:bg-foreground aria-[current=page]:text-background"
                >
                  {section.label}
                </Link>
              </li>
            ))}
        </ul>
      </nav>
      {children}
    </TenantFrame>
  );
}
