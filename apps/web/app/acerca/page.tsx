import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Brand } from "@/components/brand";
import { streamedPage } from "@/components/form";
import { softwareIdentity } from "@/lib/server/verifactu";

export const metadata: Metadata = { title: "Acerca de" };

export default streamedPage("Cargando…", About);

function identity(): { readonly rows: readonly (readonly [string, string])[]; readonly configured: boolean } {
  try {
    const software = softwareIdentity();
    return {
      configured: true,
      rows: [
        ["Nombre del sistema informático", software.name],
        ["Código identificador del sistema (IdSistemaInformatico)", software.id],
        ["Versión", software.version],
        ["Modalidad", "Solo VERI*FACTU (sistema de emisión de facturas verificables)"],
        ["Varios obligados tributarios", "Sí: cada contribuyente tiene su propia facturación y su propia cadena de registros"],
        ["Productor", `${software.producerName} (NIF ${software.producerNif})`],
      ],
    };
  } catch {
    return { configured: false, rows: [] };
  }
}

/**
 * Identificación del sistema y declaración responsable (OM HAC/1177/2024, art. 15.3: accesible dentro del propio
 * sistema). La declaración la suscribe el productor; FacturaLibre no la genera ni la presume.
 */
async function About() {
  await connection();
  const { rows, configured } = identity();
  const declaration = process.env["SIF_DECLARATION_URL"]?.trim();
  return (
    <main className="mx-auto grid w-full max-w-3xl content-start gap-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Brand href="/" />
        <Link href="/organizaciones" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Ir a mis organizaciones
        </Link>
      </div>
      <div className="surface grid gap-8 p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[1.75rem]">Acerca de FacturaLibre</h1>
        <section aria-labelledby="sistema" className="grid gap-2">
          <h2 id="sistema" className="font-semibold">
            Sistema informático de facturación
          </h2>
          {configured ? (
            <dl className="grid divide-y border-y">
              {rows.map(([term, value]) => (
                <div key={term} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-4">
                  <dt className="text-muted-foreground">{term}</dt>
                  <dd className="font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-destructive">Los datos del sistema informático no están configurados en este despliegue.</p>
          )}
        </section>
        <section aria-labelledby="declaracion" className="grid gap-2">
          <h2 id="declaracion" className="font-semibold">
            Declaración responsable
          </h2>
          {declaration === undefined || declaration === "" ? (
            <p>
              La declaración responsable de esta versión (art. 15 de la Orden HAC/1177/2024) <strong>todavía no ha sido suscrita</strong> por el productor.
              FacturaLibre no está homologado ni certificado por la AEAT.
            </p>
          ) : (
            <p>
              <a href={declaration} className="text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary">
                Declaración responsable del sistema informático de facturación
              </a>
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
