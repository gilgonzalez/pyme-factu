"use client";
// Icono de un enlace del lateral que, mientras se abre su pantalla, se convierte en un giro: confirma el clic al
// instante. Tamaño fijo (no mueve nada) y sin texto: el esqueleto de la pantalla ya anuncia la carga.
import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";

export function NavIcon({ children }: { readonly children: ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span aria-hidden="true" className="relative grid size-4 shrink-0 place-items-center [&>svg]:size-4">
      {pending ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent text-primary" /> : children}
    </span>
  );
}
