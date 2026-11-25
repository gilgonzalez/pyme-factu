import type { TenantContext } from "@facturalibre/tenancy";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppFooter, AppHeader } from "@/components/app-header";
import { ROLE_INFO } from "@/lib/roles";
import type { SessionUser } from "@/lib/server/session";

type Section = "inicio" | "contribuyentes" | "equipo";

/**
 * Marco de las pantallas de una organización: cabecera con la organización activa SIEMPRE visible y sus
 * secciones. `aside` (el contribuyente activo y sus secciones) va a la izquierda en escritorio y encima en móvil.
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
  const links: { section: Section; href: string; label: string; visible: boolean }[] = [
    { section: "inicio", href: base, label: "Inicio", visible: true },
    { section: "contribuyentes", href: `${base}/contribuyentes`, label: "Contribuyentes", visible: context.permissions.has("taxpayers.read") },
    { section: "equipo", href: `${base}/equipo`, label: "Equipo", visible: context.permissions.has("members.read") },
  ];
  return (
    <>
      <AppHeader
        userName={user.name}
        organization={
          <span className="flex min-w-0 items-center gap-2 text-sm lg:border-l lg:pl-5">
            <span className="truncate font-semibold" aria-label="Organización activa">
              {context.tenant.name}
            </span>
            <span className="shrink-0 rounded-sm bg-accent px-1.5 py-0.5 text-xs font-semibold text-accent-foreground">{ROLE_INFO[context.membership.role].label}</span>
            <Link href="/organizaciones" className="shrink-0 font-medium text-primary underline-offset-4 hover:underline">
              Cambiar
            </Link>
          </span>
        }
        nav={
          <nav aria-label="Secciones de la organización" className="h-full">
            <ul className="flex h-full gap-1">
              {links
                .filter((link) => link.visible)
                .map((link) => (
                  <li key={link.section} className="flex">
                    <Link
                      href={link.href}
                      aria-current={link.section === current ? "page" : undefined}
                      className="flex items-center border-b-[3px] border-transparent px-3 py-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
            </ul>
          </nav>
        }
      />
      {aside === undefined ? (
        <main className="mx-auto grid w-full max-w-6xl content-start gap-6 px-4 py-8 sm:px-6">{children}</main>
      ) : (
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10 lg:py-8">
          {aside}
          <main className="grid min-w-0 content-start gap-6">{children}</main>
        </div>
      )}
      <AppFooter />
    </>
  );
}
