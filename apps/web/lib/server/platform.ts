import "server-only";
import { isPlatformAdmin } from "@facturalibre/tenancy";
import { notFound } from "next/navigation";
import { getDatabase } from "./db";
import { requireUser, type SessionUser } from "./session";

/** Administrador de la plataforma o 404 (a quien no lo es no se le revela que la sección existe). */
export async function requirePlatformAdmin(returnPath: string): Promise<SessionUser> {
  const user = await requireUser(returnPath);
  if (!(await isPlatformAdmin(getDatabase(), user.id))) notFound();
  return user;
}
