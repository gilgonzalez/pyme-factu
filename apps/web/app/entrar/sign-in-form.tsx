"use client";
import { safeReturnPath } from "@facturalibre/security";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Field } from "@/components/form";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export function SignInForm() {
  const router = useRouter();
  const returnPath = safeReturnPath(useSearchParams().get("volver"));
  const linkClass = "font-medium text-foreground underline underline-offset-4";

  return (
    <AuthForm
      submitLabel="Entrar"
      pendingLabel="Entrando…"
      onSubmit={async (data) => {
        const { error } = await authClient.signIn.email({
          email: String(data.get("email") ?? "").trim(),
          password: String(data.get("password") ?? ""),
          callbackURL: returnPath,
        });
        if (error) return { error: authErrorMessage(error.code, error.status) };
        router.replace(returnPath);
        router.refresh();
        return { redirected: true };
      }}
      footer={
        <div className="grid gap-2 text-sm text-muted-foreground">
          <Link className={linkClass} href="/recuperar-contrasena">
            ¿Has olvidado tu contraseña?
          </Link>
          <p>
            ¿No tienes cuenta?{" "}
            <Link className={linkClass} href={`/registro?volver=${encodeURIComponent(returnPath)}`}>
              Crea una gratis
            </Link>
          </p>
        </div>
      }
    >
      <Field name="email" label="Email" type="email" autoComplete="email" required maxLength={254} />
      <Field name="password" label="Contraseña" type="password" autoComplete="current-password" required maxLength={128} />
    </AuthForm>
  );
}
