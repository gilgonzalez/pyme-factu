import { createDatabaseClient } from "@facturalibre/database";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { accountEmail } from "./emails";
import type { Mailer } from "./mailer";

export interface CreateAuthOptions {
  /** Cadena de conexión del rol facturalibre_auth (solo tablas de identidad). */
  readonly databaseUrl: string;
  /** URL pública de la aplicación, p. ej. https://app.facturalibre.es */
  readonly baseURL: string;
  /** Secreto de firma de cookies y tokens (≥ 32 caracteres). */
  readonly secret: string;
  readonly mailer: Mailer;
  /** Por defecto Better Auth solo limita en producción; las pruebas lo activan explícitamente. */
  readonly rateLimit?: { readonly enabled: boolean };
  /** Plugins de integración del framework (p. ej. nextCookies en la web). */
  readonly plugins?: BetterAuthPlugin[];
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function buildAuth(options: CreateAuthOptions, db: ReturnType<typeof createDatabaseClient>) {
  return betterAuth({
    appName: "FacturaLibre",
    baseURL: options.baseURL,
    secret: options.secret,
    database: prismaAdapter(db, { provider: "postgresql" }),
    // disableOriginCheck explícito: Better Auth lo desactiva por defecto con NODE_ENV=test, y queremos
    // que las pruebas ejerciten la misma protección CSRF (Origin) que producción.
    advanced: { database: { generateId: "uuid" }, disableOriginCheck: false },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: HOUR,
      sendResetPassword: ({ user, url }) => options.mailer.send(accountEmail("reset-password", user, url)),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: DAY,
      sendVerificationEmail: ({ user, url }) => options.mailer.send(accountEmail("verify-email", user, url)),
    },
    session: {
      expiresIn: 7 * DAY,
      updateAge: DAY,
      /** Operaciones sensibles (p. ej. transferir la propiedad) exigen una sesión más reciente. */
      freshAge: 10 * MINUTE,
    },
    rateLimit: {
      enabled: options.rateLimit?.enabled,
      storage: "database",
      window: MINUTE,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 15 * MINUTE, max: 5 },
        "/sign-up/email": { window: HOUR, max: 10 },
        "/request-password-reset": { window: 15 * MINUTE, max: 3 },
        "/send-verification-email": { window: 15 * MINUTE, max: 3 },
        "/reset-password": { window: 15 * MINUTE, max: 5 },
      },
    },
    plugins: options.plugins ?? [],
    databaseHooks: {
      session: {
        create: {
          /** Una cuenta desactivada por su titular (Fase 7) o suspendida por la plataforma no abre sesiones nuevas. */
          before: async (session) => {
            const user = await db.user.findUnique({ where: { id: session.userId }, select: { deactivatedAt: true, suspendedAt: true } });
            if (user?.deactivatedAt != null) throw new APIError("FORBIDDEN", { message: "Esta cuenta está desactivada.", code: "ACCOUNT_DEACTIVATED" });
            if (user?.suspendedAt != null) throw new APIError("FORBIDDEN", { message: "Esta cuenta está suspendida. Escribe al soporte de FacturaLibre.", code: "ACCOUNT_SUSPENDED" });
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof buildAuth>;

/** Crea la instancia de autenticación con su propio pool de conexiones (rol facturalibre_auth). */
export function createAuth(options: CreateAuthOptions): { readonly auth: Auth; readonly close: () => Promise<void> } {
  const db = createDatabaseClient(options.databaseUrl, { maxConnections: 5 });
  return { auth: buildAuth(options, db), close: () => db.$disconnect() };
}
