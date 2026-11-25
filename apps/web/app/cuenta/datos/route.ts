// Descarga de los datos personales de la propia cuenta (RGPD arts. 15 y 20), en JSON. Solo con sesión.
import { exportMyData } from "@facturalibre/tenancy";
import { getDatabase } from "@/lib/server/db";
import { getSessionUser } from "@/lib/server/session";

export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (user === null) return new Response("Inicia sesión para descargar tus datos.", { status: 401 });
  const data = await exportMyData(getDatabase(), user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="mis-datos-facturalibre.json"',
      "cache-control": "no-store",
    },
  });
}
