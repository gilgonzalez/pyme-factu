import "server-only";
import { createAuth, createResendMailer, createSmtpMailer, type Auth, type Mailer } from "@facturalibre/auth";
import { requireEnv } from "@facturalibre/database";
import { nextCookies } from "better-auth/next-js";

// Una única instancia por proceso (también entre recargas en desarrollo).
const holder = globalThis as typeof globalThis & { facturalibreAuth?: Auth; facturalibreMailer?: Mailer };

export function getMailer(): Mailer {
  // Con RESEND_API_KEY, por la API HTTPS de Resend (Railway bloquea el SMTP saliente); si no, por SMTP.
  const resendKey = process.env["RESEND_API_KEY"]?.trim() ?? "";
  holder.facturalibreMailer ??=
    resendKey === "" ? createSmtpMailer(requireEnv("SMTP_URL"), requireEnv("MAIL_FROM")) : createResendMailer(resendKey, requireEnv("MAIL_FROM"));
  return holder.facturalibreMailer;
}

/** Cabeceras de la IP del cliente (AUTH_IP_HEADERS, separadas por comas); sin la variable, las de Better Auth. */
function ipAddressHeaders(): { readonly ipAddressHeaders?: readonly string[] } {
  const headers = (process.env["AUTH_IP_HEADERS"] ?? "")
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter((header) => header !== "");
  return headers.length === 0 ? {} : { ipAddressHeaders: headers };
}

/**
 * Better Auth con el rol facturalibre_auth (solo identidad). El navegador habla con /api/auth/*,
 * que es donde se aplican el rate limiting persistente y la comprobación de Origin.
 */
export function getAuth(): Auth {
  holder.facturalibreAuth ??= createAuth({
    databaseUrl: requireEnv("AUTH_DATABASE_URL"),
    baseURL: requireEnv("APP_BASE_URL"),
    secret: requireEnv("AUTH_SECRET"),
    mailer: getMailer(),
    // En development se desactiva para no bloquear pruebas manuales repetidas; en test/production, activo.
    rateLimit: { enabled: process.env["FACTURALIBRE_ENV"] !== "development" },
    plugins: [nextCookies()],
    // Detrás de un proxy que añade su IP a X-Forwarded-For (Railway), la cabecera de la IP real: AUTH_IP_HEADERS=x-real-ip.
    ...ipAddressHeaders(),
  }).auth;
  return holder.facturalibreAuth;
}
