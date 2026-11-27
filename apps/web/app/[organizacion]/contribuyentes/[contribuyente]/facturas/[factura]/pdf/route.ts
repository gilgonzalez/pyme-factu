// PDF de una factura emitida o de un borrador (este, marcado «sin validez fiscal», para enseñárselo al cliente).
import { getInvoice, getTaxpayerLogo } from "@facturalibre/tenancy";
import { getDatabase } from "@/lib/server/db";
import { invoicePdf, pdfFilename } from "@/lib/server/invoice-pdf";
import { requireTaxpayer } from "@/lib/server/session";

export async function GET(request: Request, { params }: RouteContext<"/[organizacion]/contribuyentes/[contribuyente]/facturas/[factura]/pdf">): Promise<Response> {
  const { organizacion, contribuyente, factura } = await params;
  const { context, taxpayer } = await requireTaxpayer(organizacion, contribuyente, `/${organizacion}/contribuyentes/${contribuyente}/facturas/${factura}`);
  const db = getDatabase();
  const invoice = await getInvoice(db, context, factura);
  if (invoice === null) return new Response("Factura no encontrada.", { status: 404 });
  // ?vista=previa en un borrador: cómo quedará la factura, sin marca de agua (y con la nota de que no tiene validez).
  const preview = new URL(request.url).searchParams.get("vista") === "previa" && invoice.status === "DRAFT";
  const pdf = await invoicePdf(invoice, taxpayer, await getTaxpayerLogo(db, context), { preview });
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${pdfFilename(invoice, preview)}"`,
      "cache-control": "no-store",
    },
  });
}
