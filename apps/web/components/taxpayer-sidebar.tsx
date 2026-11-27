// Bloque del lateral con el contribuyente de trabajo y sus secciones (Borradores, Facturas, Clientes…). Va en
// TODAS las pantallas de una organización, no solo dentro de un contribuyente: facturar está siempre a un clic.
import type { Permission } from "@facturalibre/security";
import { BookUser, Building2, FilePen, FileText, KeyRound, Package, Plus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { NavLink } from "@/components/app-header";
import { MobileTabBar, type TabItem } from "@/components/mobile-tab-bar";

/** «nueva»: el editor de una factura nueva (en escritorio cuenta como Borradores; en móvil tiene su pestaña). */
export type TaxpayerSection = "datos" | "borradores" | "nueva" | "facturas" | "clientes" | "productos" | "registros" | "certificado";

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
      {/* Escritorio: en el lateral, agrupadas. Móvil: barra de pestañas fija abajo (mismo nombre accesible). */}
      <nav aria-label="Secciones del contribuyente" className="grid gap-3 max-lg:hidden">
        {groups.map((group) => {
          const items = group.items.filter((item) => item.visible);
          if (items.length === 0) return null;
          const id = `grupo-${group.label.toLowerCase()}`;
          return (
            <div key={group.label} role="group" aria-labelledby={id} className="grid gap-0.5">
              <p id={id} className="px-2.5 pb-0.5 text-xs font-medium text-muted-foreground">
                {group.label}
              </p>
              <ul className="grid gap-0.5">
                {items.map((item) => (
                  <li key={item.id}>
                    <NavLink href={item.href} current={item.id === (current === "nueva" ? "borradores" : current)} icon={item.icon}>
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
      <MobileTabBar label="Secciones del contribuyente" items={mobileTabs(base, can, current)} />
    </div>
  );
}

/** Pestañas del móvil por orden de uso: las cuatro primeras se ven siempre; el resto, en «Más». */
function mobileTabs(base: string, can: (permission: Permission) => boolean, current: TaxpayerSection | null): TabItem[] {
  const all: (Omit<TabItem, "current"> & { readonly id: TaxpayerSection; readonly visible: boolean })[] = [
    { id: "borradores", href: `${base}/borradores`, label: "Borradores", icon: <FilePen />, visible: can("invoices.read") },
    { id: "facturas", href: `${base}/facturas`, label: "Facturas", icon: <FileText />, visible: can("invoices.read") },
    { id: "nueva", href: `${base}/facturas/nueva`, label: "Nueva factura", shortLabel: "Nueva", icon: <Plus />, emphasis: true, visible: can("invoices.draft") },
    { id: "clientes", href: `${base}/clientes`, label: "Clientes", icon: <BookUser />, visible: can("customers.read") },
    { id: "productos", href: `${base}/productos`, label: "Productos", icon: <Package />, visible: can("products.read") },
    { id: "registros", href: `${base}/registros`, label: "Registros VERI*FACTU", icon: <ShieldCheck />, visible: can("verifactu.read") },
    { id: "certificado", href: `${base}/certificado`, label: "Certificado", icon: <KeyRound />, visible: can("certificates.manage") },
    { id: "datos", href: base, label: "Empresa", icon: <Building2 />, visible: true },
  ];
  return all.flatMap(({ visible, ...item }) => (visible ? [{ ...item, current: item.id === current }] : []));
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
