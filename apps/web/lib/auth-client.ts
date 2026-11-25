"use client";
import { createAuthClient } from "better-auth/react";

/** Cliente de Better Auth para el navegador: habla con /api/auth/* del mismo origen. */
export const authClient = createAuthClient();

/** Mensaje en español para los códigos de error de Better Auth que mostramos al usuario. */
export function authErrorMessage(code: string | undefined, status: number): string {
  if (status === 429) return "Demasiados intentos. Espera unos minutos y vuelve a probar.";
  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "El email o la contraseña no son correctos.";
    case "EMAIL_NOT_VERIFIED":
      return "Antes de entrar tienes que confirmar tu email. Te hemos enviado un enlace nuevo.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "Ya existe una cuenta con ese email. Inicia sesión o recupera tu contraseña.";
    case "PASSWORD_TOO_SHORT":
      return "La contraseña debe tener al menos 8 caracteres.";
    case "PASSWORD_TOO_LONG":
      return "La contraseña no puede superar los 128 caracteres.";
    case "ACCOUNT_DEACTIVATED":
      return "Esta cuenta está desactivada: ya no se puede entrar con ella.";
    case "INVALID_TOKEN":
      return "El enlace no es válido o ha caducado. Pide uno nuevo.";
    default:
      return "No se ha podido completar la operación. Inténtalo de nuevo.";
  }
}
