import { formatDecimal, SCALE } from "@facturalibre/fiscal-core";
import { listProducts } from "@facturalibre/tenancy";
import type { Metadata } from "next";
import { streamedPage } from "@/components/form";
import { TaxpayerFrame } from "@/components/taxpayer-frame";
import { taxLabel } from "@/lib/invoicing";
import { getDatabase } from "@/lib/server/db";
import { requireTaxpayer } from "@/lib/server/session";
import { createProductAction } from "../catalog-actions";
import { ProductForm } from "./product-form";

export const metadata: Metadata = { title: "Productos" };

export default streamedPage("Cargando los productos…", Products);

async function Products({ params }: { readonly params: PageProps<"/[organizacion]/contribuyentes/[contribuyente]/productos">["params"] }) {
  const { organizacion, contribuyente } = await params;
  const { user, context, taxpayer } = await requireTaxpayer(organizacion, contribuyente, `/${organizacion}/contribuyentes/${contribuyente}/productos`);
  const products = await listProducts(getDatabase(), context);

  return (
    <TaxpayerFrame user={user} context={context} taxpayer={taxpayer} current="productos">
      <div className="grid gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Productos y servicios</h1>
        <p className="text-muted-foreground">Los que guardes aquí se añaden a una factura con un clic.</p>
      </div>
      {products.length === 0 ? (
        <p className="text-muted-foreground">Aún no hay productos guardados.</p>
      ) : (
        <ul className="grid gap-2" aria-label="Productos">
          {products.map((product) => (
            <li key={product.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
              <span className="font-medium">{product.name}</span>
              <span className="text-sm text-muted-foreground">
                {formatDecimal(product.unitPrice, SCALE.unitPrice)} € · {taxLabel(product.taxKey)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {context.permissions.has("products.write") ? (
        <section aria-labelledby="nuevo-producto" className="grid gap-3 rounded-xl border p-4">
          <h2 id="nuevo-producto" className="font-medium">
            Nuevo producto o servicio
          </h2>
          <ProductForm action={createProductAction.bind(null, context.tenant.slug, taxpayer.id)} />
        </section>
      ) : null}
    </TaxpayerFrame>
  );
}
