import "server-only";
import { resolveTenantContext, type TenantContext } from "@facturalibre/tenancy";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getAuth } from "./auth";
import { getDatabase } from "./db";

// Capa de acceso a datos de sesión (DAL): TODA lectura del usuario o del contexto de organización
// pasa por aquí. Las páginas la llaman dentro de un <Suspense> (cacheComponents).

export interface SessionUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  /** Inicio de la sesión: las operaciones sensibles exigen que sea reciente. */
  readonly signedInAt: Date;
}

const FRESH_SESSION_MS = 10 * 60 * 1000;

export async function getSessionUser(): Promise<SessionUser | null> {
  // headers() PRIMERO: marca la ruta como dinámica antes de tocar configuración de ejecución (prerender).
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (session === null) return null;
  const { id, name, email } = session.user;
  return { id, name, email, signedInAt: new Date(session.session.createdAt) };
}

/** Usuario autenticado o redirección a /entrar (volviendo después a `returnPath`). */
export async function requireUser(returnPath: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (user === null) redirect(`/entrar?volver=${encodeURIComponent(returnPath)}`);
  return user;
}

export const isSessionFresh = (user: SessionUser, now: Date = new Date()): boolean =>
  now.getTime() - user.signedInAt.getTime() <= FRESH_SESSION_MS;

/**
 * Contexto verificado de la organización `slug` para el usuario autenticado.
 * Organización inexistente o ajena → 404 idéntico (no se revela su existencia).
 */
export async function requireTenant(slug: string, returnPath: string): Promise<{ user: SessionUser; context: TenantContext }> {
  const user = await requireUser(returnPath);
  const requestId = (await headers()).get("x-request-id") ?? crypto.randomUUID();
  const result = await resolveTenantContext(getDatabase(), { userId: user.id, tenantSlug: slug, taxpayerId: null, requestId });
  if (!result.ok) notFound();
  return { user, context: result.context };
}
