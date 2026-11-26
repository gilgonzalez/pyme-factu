import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/form";

export const metadata: Metadata = { title: "Organización suspendida" };

/** Destino de un miembro de una organización que la plataforma ha suspendido. */
export default function SuspendedOrganization() {
  return (
    <AuthShell title="Organización suspendida" description="La administración de FacturaLibre ha suspendido el acceso a esta organización.">
      <div className="grid gap-3 text-sm">
        <p>
          Tus facturas y registros se conservan y lo ya registrado se sigue enviando a la AEAT, pero ahora no se puede entrar. Escribe al soporte de
          FacturaLibre para saber el motivo y cómo reactivarla.
        </p>
        <Link href="/organizaciones" className="font-semibold text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary">
          Volver a tus organizaciones
        </Link>
      </div>
    </AuthShell>
  );
}
