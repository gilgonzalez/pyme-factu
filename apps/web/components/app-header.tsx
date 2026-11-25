import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { SignOutButton } from "@/components/sign-out-button";

/**
 * Cabecera de las pantallas autenticadas: marca, organización activa (si la hay), sus secciones y la cuenta.
 * En escritorio cabe en una fila; en móvil las secciones pasan a una tira desplazable debajo.
 */
export function AppHeader({ userName, organization, nav }: { readonly userName: string; readonly organization?: ReactNode; readonly nav?: ReactNode }) {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 pt-3 sm:px-6 lg:flex-nowrap lg:pt-0">
        <div className="lg:py-3">
          <Brand />
        </div>
        {organization === undefined ? null : <div className="order-3 min-w-0 basis-full lg:order-none lg:basis-auto lg:py-3">{organization}</div>}
        <div className="order-2 ml-auto flex items-center gap-1 text-sm lg:order-last lg:py-3">
          <span aria-label="Usuario conectado" className="hidden px-2 text-muted-foreground md:inline">
            {userName}
          </span>
          <Link href="/cuenta" className="rounded-md px-2 py-2 font-medium hover:bg-accent">
            Mi cuenta
          </Link>
          <SignOutButton />
        </div>
        {nav === undefined ? (
          <div className="order-5 basis-full pb-3 lg:hidden" />
        ) : (
          <div className="order-4 -mx-4 basis-full overflow-x-auto px-4 sm:mx-0 sm:px-0 lg:order-none lg:basis-auto lg:self-stretch">{nav}</div>
        )}
      </div>
    </header>
  );
}

/** Pie común: identidad del software y su declaración («Acerca de»), accesible desde cualquier pantalla. */
export function AppFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-5 text-sm text-muted-foreground sm:px-6">
        <p>FacturaLibre, facturación gratuita para autónomos, empresas y gestorías.</p>
        <Link href="/acerca" className="font-medium text-primary underline-offset-4 hover:underline">
          Acerca de
        </Link>
      </div>
    </footer>
  );
}
