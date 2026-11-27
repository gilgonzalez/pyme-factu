import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { InstallAppBanner } from "@/components/install-app";
import { SessionKeepAlive } from "@/components/session-keep-alive";
import { NavIcon } from "@/components/nav-pending";
import { UserRound } from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";

/**
 * Enlace de navegación del lateral (o de la tira desplazable en móvil), con icono. La sección actual va en una
 * píldora blanca y, en escritorio, con una barra violeta en el borde del lateral.
 */
export function NavLink({
  href,
  current,
  icon,
  children,
}: {
  readonly href: string;
  readonly current: boolean;
  readonly icon: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground aria-[current=page]:bg-card aria-[current=page]:text-foreground aria-[current=page]:shadow-[0_0_0_1px_var(--border),0_1px_2px_rgb(16_16_32/0.06)] lg:aria-[current=page]:before:absolute lg:aria-[current=page]:before:inset-y-2 lg:aria-[current=page]:before:-left-3 lg:aria-[current=page]:before:w-[3px] lg:aria-[current=page]:before:rounded-r-full lg:aria-[current=page]:before:bg-primary aria-[current=page]:[&_svg]:text-primary`}
    >
      <NavIcon>{icon}</NavIcon>
      {children}
    </Link>
  );
}

/** Cuenta del usuario: nombre, «Mi cuenta» y «Cerrar sesión». */
export function AccountLinks({ userName, compact = false }: { readonly userName: string; readonly compact?: boolean }) {
  return (
    <div className={compact ? "flex items-center gap-1 text-sm" : "grid gap-1 text-sm"}>
      {compact ? null : (
        <span aria-label="Usuario conectado" className="truncate px-2.5 font-medium">
          {userName}
        </span>
      )}
      <div className="flex items-center gap-1">
        <Link href="/cuenta" className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium text-muted-foreground hover:bg-black/[0.04] hover:text-foreground">
          <UserRound aria-hidden="true" className="size-4 sm:hidden" />
          <span className="max-sm:sr-only">Mi cuenta</span>
        </Link>
        <SignOutButton />
      </div>
    </div>
  );
}

/** Cabecera de las pantallas autenticadas que no son de una organización (selector, cuenta). */
export function AppHeader({ userName }: { readonly userName: string }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <Brand />
        <div className="flex items-center gap-2">
          <span aria-label="Usuario conectado" className="hidden text-sm text-muted-foreground md:inline">
            {userName}
          </span>
          <AccountLinks userName={userName} compact />
        </div>
      </div>
      <InstallAppBanner />
      <SessionKeepAlive />
    </header>
  );
}

/** Pie común: «Acerca de» (declaración responsable), accesible desde cualquier pantalla. */
export function AppFooter({ className = "" }: { readonly className?: string }) {
  return (
    <footer className={`mt-auto ${className}`}>
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-6 text-sm text-muted-foreground sm:px-8">
        <p>FacturaLibre, facturación gratuita para autónomos, empresas y gestorías.</p>
        <Link href="/acerca" className="font-medium hover:text-foreground">
          Acerca de
        </Link>
      </div>
    </footer>
  );
}
