import "server-only";
import { createAuth, createSmtpMailer, type Auth, type Mailer } from "@facturalibre/auth";
import { requireEnv } from "@facturalibre/database";
import { nextCookies } from "better-auth/next-js";

// Una única instancia por proceso (también entre recargas en desarrollo).
const holder = globalThis as typeof globalThis & { facturalibreAuth?: Auth; facturalibreMailer?: Mailer };

export function getMailer(): Mailer {
  holder.facturalibreMailer ??= createSmtpMailer(requireEnv("SMTP_URL"), requireEnv("MAIL_FROM"));
  return holder.facturalibreMailer;
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
  }).auth;
  return holder.facturalibreAuth;
}
