"use client";
import { safeReturnPath } from "@facturalibre/security";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Field } from "@/components/form";
import { ResendVerification } from "@/components/resend-verification";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export function SignUpForm() {
  const returnPath = safeReturnPath(useSearchParams().get("volver"));

  return (
    <AuthForm
      submitLabel="Crear cuenta"
      pendingLabel="Creando cuenta…"
      onSubmit={async (data) => {
        const email = String(data.get("email") ?? "").trim();
        const { error } = await authClient.signUp.email({
          name: String(data.get("name") ?? "").trim(),
          email,
          password: String(data.get("password") ?? ""),
          callbackURL: returnPath,
        });
        if (error) return { error: authErrorMessage(error.code, error.status) };
        return {
          success: (
            <>
              <strong>Revisa tu bandeja de entrada.</strong> Te hemos enviado un enlace a <strong>{email}</strong> para confirmar tu
              cuenta. Si ya te habías registrado con este email y no lo confirmaste, pide otro enlace aquí abajo.
            </>
          ),
          after: <ResendVerification email={email} callbackURL={returnPath} />,
        };
      }}
      footer={
        <p className="text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{" "}
          <Link className="font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary" href={`/entrar?volver=${encodeURIComponent(returnPath)}`}>
            Inicia sesión
          </Link>
        </p>
      }
    >
      <Field name="name" label="Nombre y apellidos" autoComplete="name" required maxLength={120} />
      <Field name="email" label="Email" type="email" autoComplete="email" required maxLength={254} />
      <Field
        name="password"
        label="Contraseña"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={128}
        hint="Mínimo 8 caracteres. Una frase fácil de recordar es más segura que una palabra corta."
      />
    </AuthForm>
  );
}
