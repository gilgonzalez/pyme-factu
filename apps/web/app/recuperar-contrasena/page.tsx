"use client";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { AuthShell, Field } from "@/components/form";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Recupera tu contraseña" description="Te enviaremos un enlace para elegir una contraseña nueva.">
      <AuthForm
        submitLabel="Enviar enlace"
        pendingLabel="Enviando…"
        onSubmit={async (data) => {
          const { error } = await authClient.requestPasswordReset({
            email: String(data.get("email") ?? "").trim(),
            redirectTo: "/restablecer-contrasena",
          });
          // El mismo mensaje exista o no la cuenta: no revelamos qué emails están registrados.
          if (error?.status === 429) return { error: authErrorMessage(error.code, error.status) };
          return {
            success: "Si hay una cuenta con ese email, recibirás un enlace en unos minutos. Caduca en 1 hora.",
          };
        }}
        footer={
          <Link className="text-sm font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary" href="/entrar">
            Volver a iniciar sesión
          </Link>
        }
      >
        <Field name="email" label="Email de tu cuenta" type="email" autoComplete="email" required maxLength={254} />
      </AuthForm>
    </AuthShell>
  );
}
