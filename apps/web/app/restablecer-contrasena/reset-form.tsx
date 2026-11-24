"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Field, FormAlert } from "@/components/form";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token");

  if (token === null || params.get("error") !== null) {
    return (
      <FormAlert tone="error">
        El enlace no es válido o ha caducado.{" "}
        <Link className="font-medium underline underline-offset-4" href="/recuperar-contrasena">
          Pide uno nuevo
        </Link>
        .
      </FormAlert>
    );
  }

  return (
    <AuthForm
      submitLabel="Guardar contraseña"
      pendingLabel="Guardando…"
      onSubmit={async (data) => {
        const { error } = await authClient.resetPassword({ newPassword: String(data.get("password") ?? ""), token });
        if (error) return { error: authErrorMessage(error.code, error.status) };
        return {
          success: (
            <>
              Contraseña cambiada. Hemos cerrado tus otras sesiones por seguridad.{" "}
              <Link className="font-medium underline underline-offset-4" href="/entrar">
                Inicia sesión
              </Link>
              .
            </>
          ),
        };
      }}
    >
      <Field
        name="password"
        label="Contraseña nueva"
        type="password"
        autoComplete="new-password"
        required
        minLength={12}
        maxLength={128}
        hint="Mínimo 12 caracteres."
      />
    </AuthForm>
  );
}
