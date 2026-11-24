import type { Metadata } from "next";
import { AuthShell } from "@/components/form";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Elige una contraseña nueva" description="Al guardarla se cerrarán todas tus sesiones abiertas.">
      <ResetPasswordForm />
    </AuthShell>
  );
}
