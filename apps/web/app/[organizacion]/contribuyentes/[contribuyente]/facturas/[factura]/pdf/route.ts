// PDF de una factura emitida (los borradores no tienen validez fiscal: no se descargan).
import { getInvoice } from "@facturalibre/tenancy";
import { getDatabase } from "@/lib/server/db";
import { invoicePdf } from "@/lib/server/invoice-pdf";
import { requireTaxpayer } from "@/lib/server/session";

export async function GET(_request: Request, { params }: RouteContext<"/[organizacion]/contribuyentes/[contribuyente]/facturas/[factura]/pdf">): Promise<Response> {
  const { organizacion, contribuyente, factura } = await params;
  const { context, taxpayer } = await requireTaxpayer(organizacion, contribuyente, `/${organizacion}/contribuyentes/${contribuyente}/facturas/${factura}`);
  const invoice = await getInvoice(getDatabase(), context, factura);
  if (invoice?.status !== "ISSUED" || invoice.number === null) return new Response("Factura no encontrada.", { status: 404 });
  const pdf = await invoicePdf(invoice, taxpayer);
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${invoice.number}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
