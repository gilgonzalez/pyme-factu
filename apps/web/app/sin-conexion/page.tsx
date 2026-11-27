import type { Metadata } from "next";
import { AuthShell } from "@/components/form";

export const metadata: Metadata = { title: "Sin conexión" };

/** La muestra el service worker cuando una pantalla no se puede cargar por falta de red. */
export default function Offline() {
  return (
    <AuthShell title="Sin conexión" description="FacturaLibre necesita internet para mostrar y guardar tus facturas.">
      <p className="text-sm text-muted-foreground">
        Por seguridad, tus datos no se guardan en este dispositivo. Comprueba la conexión y vuelve a intentarlo: lo que tuvieras sin guardar en
        otra pantalla sigue allí.
      </p>
    </AuthShell>
  );
}
