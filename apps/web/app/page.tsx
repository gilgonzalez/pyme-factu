import { qrSvg } from "@facturalibre/verifactu";
import { Building2, FileCheck2, Hash, Send } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { StatusBadge } from "@/components/invoice-status";
import { buttonVariants } from "@/components/ui/button";

// Página pública. El acceso lleva a /organizaciones (selector) tras iniciar sesión.

const FEATURES: readonly { readonly icon: ReactNode; readonly title: string; readonly text: string }[] = [
  { icon: <Hash />, title: "Numeración sin huecos", text: "Cada serie numera por año. Una factura emitida ya no se modifica: se rectifica." },
  { icon: <FileCheck2 />, title: "Registro con huella", text: "Cada factura genera su registro VERI*FACTU encadenado al anterior, y la app comprueba la cadena." },
  { icon: <Send />, title: "Remisión automática", text: "Con el certificado del contribuyente, los registros llegan a la Agencia Tributaria sin que hagas nada." },
  { icon: <Building2 />, title: "Hecho para gestorías", text: "Varios contribuyentes por organización y, para cada persona del equipo, qué puede hacer." },
];

/** Ilustración: una factura tal como se ve en la aplicación. Datos ficticios. */
async function ProductPreview() {
  const svg = await qrSvg("Factura de ejemplo de FacturaLibre: datos ficticios");
  return (
    <div aria-hidden="true" className="relative select-none rounded-3xl bg-subtle p-4 sm:p-8">
      <div className="surface grid gap-5 p-5 shadow-[0_24px_48px_-24px_rgb(16_16_32/0.25)] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-0.5">
            <p className="text-xs text-muted-foreground">Factura</p>
            <p className="font-mono text-lg font-semibold">F2026-0042</p>
          </div>
          <StatusBadge tone="success">Aceptada por la AEAT</StatusBadge>
        </div>
        <div className="grid grid-cols-[auto_1fr] items-center gap-5">
          <div className="grid justify-items-center gap-1 text-center text-[0.7rem] font-semibold">
            <p>QR tributario:</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG generado en el servidor como data URI */}
            <img src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`} alt="" className="size-20" />
            <p>VERI*FACTU</p>
          </div>
          <div className="grid gap-0.5 text-sm">
            <p className="text-muted-foreground">Cliente</p>
            <p className="font-medium">Reformas Ficticias SL</p>
            <p className="font-mono text-xs text-muted-foreground">NIF B12345674</p>
          </div>
        </div>
        <div className="figures grid gap-1.5 border-t pt-4 text-sm">
          <p className="flex justify-between gap-2 text-muted-foreground">
            <span>Base imponible</span>
            <span className="text-foreground">500,00 €</span>
          </p>
          <p className="flex justify-between gap-2 text-muted-foreground">
            <span>IVA 21 %</span>
            <span className="text-foreground">105,00 €</span>
          </p>
          <p className="mt-1 flex justify-between gap-2 border-t pt-3 text-lg font-semibold">
            <span>Total</span>
            <span>605,00 €</span>
          </p>
        </div>
      </div>
      <div className="surface absolute -bottom-4 left-6 hidden items-center gap-3 px-4 py-3 text-sm shadow-[0_16px_32px_-16px_rgb(16_16_32/0.3)] sm:flex">
        <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-foreground">
          <FileCheck2 className="size-4" />
        </span>
        <span className="grid leading-tight">
          <span className="font-medium">Registro nº 42 encadenado</span>
          <span className="font-mono text-xs text-muted-foreground">Huella 3C46…F7B9</span>
        </span>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-8">
        <Brand href="/" />
        <nav className="flex items-center gap-2">
          <Link href="/entrar" className={buttonVariants({ variant: "ghost" })}>
            Iniciar sesión
          </Link>
          <Link href="/registro" className={buttonVariants()}>
            Crear cuenta
          </Link>
        </nav>
      </header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-24 px-4 pt-10 pb-20 sm:px-8 lg:pt-20">
        <section className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid justify-items-start gap-6">
            <StatusBadge tone="neutral">Gratuito para autónomos y empresas</StatusBadge>
            <h1 className="max-w-[15ch] text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.035em] sm:text-[3.25rem] lg:text-[3.75rem]">
              Facturas con VERI*FACTU, sin pagar por ello.
            </h1>
            <p className="max-w-[52ch] text-lg text-muted-foreground">
              FacturaLibre numera cada factura, le pone su QR tributario, genera su registro encadenado y lo remite a la Agencia Tributaria. Para
              autónomos, empresas y gestorías.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/registro" className={buttonVariants({ size: "lg" })}>
                Crear cuenta gratis
              </Link>
              <Link href="/entrar" className={buttonVariants({ size: "lg", variant: "outline" })}>
                Ya tengo cuenta
              </Link>
            </div>
          </div>
          <ProductPreview />
        </section>

        <section aria-labelledby="que-hace" className="grid gap-10">
          <h2 id="que-hace" className="max-w-[24ch] text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
            Lo que exige la ley, hecho por ti en cada factura.
          </h2>
          <dl className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="grid content-start gap-2">
                <dt className="grid gap-3 font-semibold">
                  <span aria-hidden="true" className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground [&>svg]:size-4">
                    {feature.icon}
                  </span>
                  {feature.title}
                </dt>
                <dd className="text-sm text-muted-foreground">{feature.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="max-w-[72ch] rounded-xl border border-warning/30 bg-warning-soft px-5 py-4 text-sm text-warning-ink">
          <strong>En desarrollo.</strong> La remisión a la Agencia Tributaria solo se ha probado contra un simulador: todavía no sirve para facturar de
          verdad. Ningún programa está «homologado» por la AEAT; el productor declara que cumple, y esa declaración aún no está suscrita.{" "}
          <Link href="/acerca" className="font-semibold underline underline-offset-4">
            Más información
          </Link>
        </p>
      </main>
    </>
  );
}
