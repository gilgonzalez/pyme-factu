// Logo del contribuyente, para la vista previa de la configuración. Privado: requiere sesión y acceso al contribuyente.
import { getTaxpayerLogo } from "@facturalibre/tenancy";
import { getDatabase } from "@/lib/server/db";
import { requireTenant } from "@/lib/server/session";

export async function GET(_request: Request, { params }: RouteContext<"/[organizacion]/contribuyentes/[contribuyente]/logo">): Promise<Response> {
  const { organizacion, contribuyente } = await params;
  const { context } = await requireTenant(organizacion, `/${organizacion}/contribuyentes/${contribuyente}`, contribuyente);
  const logo = await getTaxpayerLogo(getDatabase(), context);
  if (logo === null) return new Response("Sin logo.", { status: 404 });
  return new Response(Buffer.from(logo.bytes), {
    headers: {
      "content-type": logo.mimeType,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
