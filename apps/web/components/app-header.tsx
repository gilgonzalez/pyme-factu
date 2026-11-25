import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/sign-out-button";

/** Cabecera de las pantallas autenticadas: marca, organización activa (si la hay) y cuenta. */
export function AppHeader({ userName, organization }: { readonly userName: string; readonly organization?: ReactNode }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
        <Link href="/organizaciones" className="font-semibold tracking-tight">
          FacturaLibre
        </Link>
        {organization}
        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/cuenta" className="underline-offset-4 hover:underline">
            Mi cuenta
          </Link>
          <Link href="/acerca" className="underline-offset-4 hover:underline">
            Acerca de
          </Link>
          <span aria-label="Usuario conectado">{userName}</span>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
