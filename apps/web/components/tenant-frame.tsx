import type { TenantContext } from "@facturalibre/tenancy";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import { ROLE_INFO } from "@/lib/roles";
import type { SessionUser } from "@/lib/server/session";

type Section = "inicio" | "equipo";

/** Marco de las pantallas de una organización: cabecera, organización activa SIEMPRE visible y navegación. */
export function TenantFrame({
  user,
  context,
  current,
  children,
}: {
  readonly user: SessionUser;
  readonly context: TenantContext;
  readonly current: Section;
  readonly children: ReactNode;
}) {
  const base = `/${context.tenant.slug}`;
  const links: { section: Section; href: string; label: string; visible: boolean }[] = [
    { section: "inicio", href: base, label: "Inicio", visible: true },
    { section: "equipo", href: `${base}/equipo`, label: "Equipo", visible: context.permissions.has("members.read") },
  ];
  return (
    <>
      <AppHeader
        userName={user.name}
        organization={
          <span className="flex items-center gap-2 text-sm">
            <span aria-hidden="true" className="text-muted-foreground">
              /
            </span>
            <span className="font-medium" aria-label="Organización activa">
              {context.tenant.name}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{ROLE_INFO[context.membership.role].label}</span>
            <Link href="/organizaciones" className="text-muted-foreground underline underline-offset-4">
              Cambiar
            </Link>
          </span>
        }
      />
      <nav aria-label="Secciones de la organización" className="border-b">
        <ul className="mx-auto flex w-full max-w-5xl gap-1 px-6">
          {links
            .filter((link) => link.visible)
            .map((link) => (
              <li key={link.section}>
                <Link
                  href={link.href}
                  aria-current={link.section === current ? "page" : undefined}
                  className="inline-block border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
        </ul>
      </nav>
      <main className="mx-auto grid w-full max-w-5xl gap-6 px-6 py-8">{children}</main>
    </>
  );
}
