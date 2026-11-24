import type { Metadata } from "next";
import { AuthShell } from "@/components/form";
import { OrganizationForm } from "./organization-form";

export const metadata: Metadata = { title: "Crear organización" };

// La sesión se comprueba en la Server Action (requireUser) y en el destino tras crearla.
export default function NewOrganizationPage() {
  return (
    <AuthShell
      title="Crea tu organización"
      description="Una organización agrupa a tu equipo y a los contribuyentes para los que facturáis. Serás su propietario."
    >
      <OrganizationForm />
    </AuthShell>
  );
}
