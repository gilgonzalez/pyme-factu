import { isDatabaseReachable } from "@facturalibre/database";
import { connection } from "next/server";
import { getDatabase } from "@/lib/server/db";

/** Health check para Docker/orquestador. Nunca expone detalles internos. */
export async function GET(): Promise<Response> {
  await connection(); // siempre en tiempo de petición, nunca prerenderizado
  const databaseOk = await isDatabaseReachable(getDatabase());
  return Response.json(
    { status: databaseOk ? "ok" : "degraded", checks: { database: databaseOk ? "ok" : "unavailable" } },
    { status: databaseOk ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
