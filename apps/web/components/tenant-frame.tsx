import type { TenantContext } from "@facturalibre/tenancy";
import { Building2, House, Info, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AccountLinks, AppFooter, NavLink } from "@/components/app-header";
import { Brand } from "@/components/brand";
import { ROLE_INFO } from "@/lib/roles";
import type { SessionUser } from "@/lib/server/session";

type Section = "inicio" | "contribuyentes" | "equipo";

/**
 * Marco de las pantallas de una organización: lateral fijo (escritorio) con la organización activa SIEMPRE
 * visible, sus secciones, `aside` (el contribuyente activo y sus secciones) y la cuenta. En móvil, el mismo
 * contenido en filas compactas con las secciones en tiras desplazables.
 */
export function TenantFrame({
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
          <div className="flex items-center justify-between gap-3 px-4 pt-3 lg:px-2.5 lg:pt-0">
            <Brand />
            <div className="lg:hidden">
              <AccountLinks userName={user.name} compact />
            </div>
          </div>

          <div className="mx-4 mt-3 flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2 shadow-[0_1px_2px_rgb(16_16_32/0.04)] lg:mx-0 lg:mt-0">
            <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-md bg-accent text-sm font-semibold text-accent-foreground">
              {context.tenant.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate text-sm font-semibold" aria-label="Organización activa">
                {context.tenant.name}
              </span>
              <span className="text-xs text-muted-foreground">{ROLE_INFO[context.membership.role].label}</span>
            </span>
            <Link
              href="/organizaciones"
              className="shrink-0 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-black/[0.04] hover:text-foreground"
            >
              Cambiar
            </Link>
          </div>

          <nav aria-label="Secciones de la organización" className="overflow-x-auto px-4 pt-2 lg:overflow-visible lg:p-0">
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

          {aside}

          <div className="hidden border-t pt-4 lg:mt-auto lg:grid lg:gap-1">
            <AccountLinks userName={user.name} />
            <NavLink href="/acerca" current={false} icon={<Info />}>
              Acerca de
            </NavLink>
          </div>
          <div className="h-3 lg:hidden" />
        </header>
      </div>

      <div className="flex min-w-0 flex-col">
        <main className="mx-auto grid w-full max-w-5xl flex-1 content-start gap-6 px-4 py-6 sm:px-8 lg:px-10 lg:py-10">{children}</main>
        <AppFooter className="lg:hidden" />
      </div>
    </div>
  );
}
