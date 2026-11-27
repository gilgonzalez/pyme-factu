// Bloque del lateral con el contribuyente de trabajo y sus secciones (Borradores, Facturas, Clientes…). Va en
// TODAS las pantallas de una organización, no solo dentro de un contribuyente: facturar está siempre a un clic.
import type { Permission } from "@facturalibre/security";
import { BookUser, Building2, FilePen, FileText, KeyRound, Package, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { NavLink } from "@/components/app-header";

export type TaxpayerSection = "datos" | "borradores" | "facturas" | "clientes" | "productos" | "registros" | "certificado";

export interface SidebarTaxpayer {
  readonly id: string;
  readonly legalName: string;
  readonly nif: string;
}

type Item = { readonly id: TaxpayerSection; readonly href: string; readonly label: string; readonly icon: ReactNode; readonly visible: boolean };

export function TaxpayerSidebar({
  slug,
  taxpayer,
  permissions,
  current,
}: {
  readonly slug: string;
  readonly taxpayer: SidebarTaxpayer;
  /** Permisos efectivos sobre ESTE contribuyente: las secciones sin permiso no se muestran. */
  readonly permissions: ReadonlySet<Permission>;
  /** null en las pantallas de la organización (ninguna sección del contribuyente está abierta). */
  readonly current: TaxpayerSection | null;
}) {
  const base = `/${slug}/contribuyentes/${taxpayer.id}`;
  const can = (permission: Permission): boolean => permissions.has(permission);
  // Agrupadas por lo que son; en móvil, una sola tira desplazable (los títulos de grupo solo se leen).
  const groups: { readonly label: string; readonly items: readonly Item[] }[] = [
    {
      label: "Facturación",
      items: [
        { id: "borradores", href: `${base}/borradores`, label: "Borradores", icon: <FilePen />, visible: can("invoices.read") },
        { id: "facturas", href: `${base}/facturas`, label: "Facturas", icon: <FileText />, visible: can("invoices.read") },
      ],
    },
    {
      label: "Catálogo",
      items: [
        { id: "clientes", href: `${base}/clientes`, label: "Clientes", icon: <BookUser />, visible: can("customers.read") },
        { id: "productos", href: `${base}/productos`, label: "Productos", icon: <Package />, visible: can("products.read") },
      ],
    },
    {
      label: "Cumplimiento",
      items: [
        { id: "registros", href: `${base}/registros`, label: "Registros VERI*FACTU", icon: <ShieldCheck />, visible: can("verifactu.read") },
        { id: "certificado", href: `${base}/certificado`, label: "Certificado", icon: <KeyRound />, visible: can("certificates.manage") },
      ],
    },
    { label: "Ajustes", items: [{ id: "datos", href: base, label: "Empresa", icon: <Building2 />, visible: true }] },
  ];
  return (
    <div className="grid gap-3 pt-2 pb-2.5 lg:border-t lg:pt-4 lg:pb-0">
      <div className="mx-3 grid gap-1.5 lg:mx-0">
        <p className="hidden px-2.5 text-xs font-medium text-muted-foreground lg:block">Facturando como</p>
        <div aria-label="Contribuyente activo" className="flex items-center gap-2.5 rounded-xl border bg-card px-2.5 py-1.5 shadow-[0_1px_2px_rgb(16_16_32/0.04)] lg:px-3 lg:py-2">
          <span aria-hidden="true" className="grid size-6 shrink-0 lg:size-7 place-items-center rounded-full bg-foreground text-xs font-semibold text-background">
            {taxpayer.legalName.slice(0, 1).toUpperCase()}
          </span>
          <span className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-sm font-semibold" title={taxpayer.legalName}>
              {taxpayer.legalName}
            </span>
            <span className="font-mono text-[0.6875rem] text-muted-foreground">NIF {taxpayer.nif}</span>
          </span>
          <Link
            href={`/${slug}/contribuyentes`}
            className="shrink-0 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-black/[0.04] hover:text-foreground"
          >
            Cambiar
          </Link>
        </div>
      </div>
      {/* En móvil, barra de pestañas fija abajo (respeta la zona segura del iPhone); en escritorio, en el lateral. */}
      <nav
        aria-label="Secciones del contribuyente"
        className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t bg-card/95 px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgb(16_16_32/0.06)] backdrop-blur lg:static lg:z-auto lg:grid lg:gap-3 lg:overflow-visible lg:border-t-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none"
      >
        {groups.map((group) => {
          const items = group.items.filter((item) => item.visible);
          if (items.length === 0) return null;
          const id = `grupo-${group.label.toLowerCase()}`;
          return (
            <div key={group.label} role="group" aria-labelledby={id} className="flex shrink-0 lg:grid lg:gap-0.5">
              <p id={id} className="sr-only lg:not-sr-only lg:px-2.5 lg:pb-0.5 lg:text-xs lg:font-medium lg:text-muted-foreground">
                {group.label}
              </p>
              <ul className="flex lg:grid lg:gap-0.5">
                {items.map((item) => (
                  <li key={item.id}>
                    <NavLink href={item.href} current={item.id === current} icon={item.icon} mobileTab>
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

/** Sin contribuyentes todavía: el lateral invita a dar de alta el primero (o a pedir acceso). */
export function NoTaxpayerSidebar({ slug, canCreate }: { readonly slug: string; readonly canCreate: boolean }) {
  return (
    <div className="mx-4 grid gap-2 rounded-xl border border-dashed bg-card px-3.5 py-3 text-sm lg:mx-0">
      <p className="font-medium">Aún no facturas para nadie</p>
      {canCreate ? (
        <Link href={`/${slug}/contribuyentes`} className="font-semibold text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary">
          Da de alta tu empresa
        </Link>
      ) : (
        <p className="text-muted-foreground">Pide acceso a un contribuyente a quien administra la organización.</p>
      )}
    </div>
  );
}
