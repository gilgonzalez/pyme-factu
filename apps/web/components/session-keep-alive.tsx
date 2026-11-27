"use client";
// Mantiene viva la sesión de quien usa la aplicación. Las páginas leen la sesión al renderizarse en el servidor,
// donde Next no deja escribir cookies: Better Auth no puede renovar la cookie ahí y caducaría a los 30 días del
// inicio de sesión aunque se use a diario. /api/auth/get-session es una ruta de API y sí la renueva (como mucho
// una vez al día, updateAge). Se consulta al abrir y al volver a la app, como mucho una vez por hora.
import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";

const LAST_CHECK_KEY = "facturalibre:sesion-comprobada";
const EVERY_MS = 60 * 60 * 1000;

function keepAlive(): void {
  const last = Number(localStorage.getItem(LAST_CHECK_KEY) ?? "0");
  if (Date.now() - last < EVERY_MS) return;
  localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
  // Sin sesión o sin red no hay nada que renovar: la próxima pantalla ya lo resolverá.
  authClient.getSession().catch(() => undefined);
}

export function SessionKeepAlive() {
  useEffect(() => {
    keepAlive();
    // Una PWA puede pasar días abierta en segundo plano: al volver a ella, también.
    const onVisible = () => {
      if (document.visibilityState === "visible") keepAlive();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  return null;
}
