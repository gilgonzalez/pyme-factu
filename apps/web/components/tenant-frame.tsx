import { effectivePermissions } from "@facturalibre/security";
import { listTaxpayers, type TenantContext } from "@facturalibre/tenancy";
import { cookies } from "next/headers";
import { Building2, House, Info, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { exitSupportAction } from "@/app/plataforma/actions";
import { ActionButton } from "@/components/action-button";
import { AccountLinks, AppFooter, NavLink } from "@/components/app-header";
import { Brand } from "@/components/brand";
import { InstallAppBanner, InstallAppItem } from "@/components/install-app";
import { SessionKeepAlive } from "@/components/session-keep-alive";
import { NoTaxpayerSidebar, TaxpayerSidebar } from "@/components/taxpayer-sidebar";
import { getDatabase } from "@/lib/server/db";
import { pickWorkingTaxpayer, workingTaxpayerCookie } from "@/lib/working-taxpayer";
import { ROLE_INFO } from "@/lib/roles";
import type { SessionUser } from "@/lib/server/session";

type Section = "inicio" | "contribuyentes" | "equipo";

/**
 * En las pantallas de la organización, el lateral muestra igualmente el contribuyente de trabajo (el último
 * abierto o el primero) con sus secciones: Borradores, Facturas, Clientes… a un clic desde cualquier sitio.
 */
async function workingTaxpayerAside(context: TenantContext): Promise<ReactNode> {
  if (!context.permissions.has("taxpayers.read")) return null;
  const taxpayers = await listTaxpayers(getDatabase(), context);
  const remembered = (await cookies()).get(workingTaxpayerCookie(context.tenant.id))?.value;
  const taxpayer = pickWorkingTaxpayer(taxpayers, remembered);
  if (taxpayer === null) return <NoTaxpayerSidebar slug={context.tenant.slug} canCreate={context.permissions.has("taxpayers.create")} />;
  return (
    <TaxpayerSidebar
      slug={context.tenant.slug}
      taxpayer={taxpayer}
      permissions={effectivePermissions(context.membership.role, taxpayer.access)}
      current={null}
    />
  );
}

/**
 * Marco de las pantallas de una organización: lateral fijo (escritorio) con la organización activa SIEMPRE
 * visible, sus secciones, `aside` (el contribuyente activo y sus secciones) y la cuenta. En móvil, el mismo
 * contenido en filas compactas con las secciones en tiras desplazables.
 */
export async function TenantFrame({
  user,
  context,
  current,
  aside,
  children,
}: {
  readonly user: SessionUser;
  readonly context: TenantContext;
  readonly current: Section;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
}) {
  const base = `/${context.tenant.slug}`;
  // Dentro de un contribuyente, el suyo; en la organización, el de trabajo.
  const sidebar = aside ?? (await workingTaxpayerAside(context));
  const links: { section: Section; href: string; label: string; icon: ReactNode; visible: boolean }[] = [
    { section: "inicio", href: base, label: "Inicio", icon: <House />, visible: true },
    {
      section: "contribuyentes",
      href: `${base}/contribuyentes`,
      label: "Contribuyentes",
      icon: <Building2 />,
      visible: context.permissions.has("taxpayers.read"),
    },
    { section: "equipo", href: `${base}/equipo`, label: "Equipo", icon: <Users />, visible: context.permissions.has("members.read") },
  ];
  return (
    <div className="flex min-h-screen flex-col lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <div className="border-b bg-subtle lg:border-r lg:border-b-0">
        <header className="lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:gap-5 lg:overflow-y-auto lg:px-3 lg:py-5">
          {/* En móvil, una sola fila: logotipo, organización y cuenta (iconos). En escritorio, apilados. */}
          <div className="flex items-center gap-2 px-3 pt-2.5 lg:grid lg:gap-5 lg:px-0 lg:pt-0">
            <div className="shrink-0 lg:px-2.5">
              <Brand compactOnMobile />
            </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border bg-card px-2.5 py-1.5 shadow-[0_1px_2px_rgb(16_16_32/0.04)] lg:gap-2.5 lg:px-3 lg:py-2">
            <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-md bg-accent text-xs font-semibold text-accent-foreground lg:size-7 lg:text-sm">
              {context.tenant.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate text-sm font-semibold" aria-label="Organización activa">
                {context.tenant.name}
              </span>
              <span className="text-[0.6875rem] text-muted-foreground lg:text-xs">{ROLE_INFO[context.membership.role].label}</span>
            </span>
            <Link
              href="/organizaciones"
              className="shrink-0 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-black/[0.04] hover:text-foreground"
            >
              Cambiar
            </Link>
          </div>
            <div className="shrink-0 lg:hidden">
              <AccountLinks userName={user.name} compact />
            </div>
          </div>

          <nav aria-label="Secciones de la organización" className="scroll-fade-x overflow-x-auto px-3 pt-1 lg:overflow-visible lg:p-0">
            <ul className="flex gap-1 lg:grid lg:gap-0.5">
              {links
                .filter((link) => link.visible)
                .map((link) => (
                  <li key={link.section}>
                    <NavLink href={link.href} current={link.section === current && aside === undefined} icon={link.icon}>
                      {link.label}
                    </NavLink>
                  </li>
                ))}
            </ul>
          </nav>

          {sidebar}

          <div className="hidden border-t pt-4 lg:mt-auto lg:grid lg:gap-1">
            <AccountLinks userName={user.name} />
            <InstallAppItem />
            <NavLink href="/acerca" current={false} icon={<Info />}>
              Acerca de
            </NavLink>
          </div>
          <div className="h-3 lg:hidden" />
        </header>
      </div>

      <div className="flex min-w-0 flex-col">
        {context.support ? (
          <div role="status" className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-danger-ink/20 bg-danger-soft px-4 py-2.5 text-sm text-danger-ink sm:px-8">
            <p>
              <strong>Modo soporte</strong>: estás viendo «{context.tenant.name}» en solo lectura. Este acceso queda en su auditoría.
            </p>
            <ActionButton action={exitSupportAction} label="Salir del modo soporte" idle="Salir del modo soporte" busy="Saliendo…" variant="outline" />
          </div>
        ) : null}
        <main className="mx-auto grid w-full max-w-5xl flex-1 content-start gap-6 px-4 pt-5 pb-28 sm:px-8 lg:px-10 lg:py-10">
          <InstallAppBanner />
          <SessionKeepAlive />
          {children}
        </main>
        <AppFooter className="lg:hidden" />
      </div>
    </div>
  );
}
