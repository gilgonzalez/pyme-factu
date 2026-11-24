import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/server/auth";

// Endpoints de Better Auth (registro, inicio de sesión, verificación, recuperación...).
// Se resuelve en cada petición para no leer variables de entorno durante la build.
export function GET(request: Request): Promise<Response> {
  return toNextJsHandler(getAuth()).GET(request);
}

export function POST(request: Request): Promise<Response> {
  return toNextJsHandler(getAuth()).POST(request);
}
