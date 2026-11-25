import { qrSvg } from "@facturalibre/verifactu";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";

// Página pública. El acceso lleva a /organizaciones (selector) tras iniciar sesión.

const FEATURES: readonly { readonly title: string; readonly text: string }[] = [
  { title: "Numeración sin huecos", text: "Cada serie numera por año; una factura emitida ya no se puede modificar, solo rectificar." },
  { title: "Registro con huella", text: "Cada factura genera su registro VERI*FACTU, encadenado al anterior. La app comprueba la cadena cada vez que la abres." },
  { title: "Remisión automática", text: "Con el certificado del contribuyente, los registros se envían a la Agencia Tributaria sin que tengas que hacer nada." },
  { title: "Para gestorías", text: "Una organización, varios contribuyentes, y para cada persona del equipo, lo que puede hacer y con quién." },
];

/** Ilustración: el original de una factura sobre su copia amarilla de calco. Datos ficticios. */
async function SampleInvoice() {
  const svg = await qrSvg("Factura de ejemplo de FacturaLibre: datos ficticios");
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-md select-none lg:mx-0">
      <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-md bg-copy-yellow shadow-[0_0_0_1px_rgb(92_71_0/0.15)] sm:translate-x-5 sm:translate-y-5" />
      <div className="sheet relative grid grid-cols-[5.5rem_12px_1fr] text-[0.8rem] sm:grid-cols-[7rem_12px_1fr]">
        <div className="grid content-start gap-3 rounded-l-[6px] bg-secondary px-3 py-5">
          <p className="grid">
            <span className="text-[0.65rem] font-bold text-muted-foreground">Factura</span>
            <span className="font-mono text-[0.75rem] font-bold whitespace-nowrap sm:text-[0.8rem]">F2026-0042</span>
          </p>
          <p className="grid">
            <span className="text-[0.65rem] font-bold text-muted-foreground">Total</span>
            <span className="figures font-bold">605,00 €</span>
          </p>
        </div>
        <div className="perforation bg-card" />
        <div className="grid gap-4 p-4 sm:p-5">
          <div className="grid justify-items-center text-center font-bold">
            <p>QR tributario:</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG generado en el servidor como data URI */}
            <img src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`} alt="" className="my-2 size-20 sm:size-24" />
            <p>VERI*FACTU</p>
          </div>
          <div className="grid gap-0.5">
            <p className="font-bold">Reformas Ficticias SL</p>
            <p className="font-mono text-muted-foreground">NIF B12345674</p>
          </div>
          <div className="figures grid gap-1 border-t-2 border-foreground pt-2">
            <p className="flex justify-between gap-2">
              <span>Cambio de bañera</span>
              <span>500,00 €</span>
            </p>
            <p className="flex justify-between gap-2 text-muted-foreground">
              <span>IVA 21 %</span>
              <span>105,00 €</span>
            </p>
            <p className="flex justify-between gap-2 border-t pt-1 text-base font-bold">
              <span>Total</span>
              <span>605,00 €</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Brand href="/" />
        <Link href="/entrar" className="rounded-md px-3 py-2 text-sm font-semibold hover:bg-card">
          Iniciar sesión
        </Link>
      </header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-16 px-4 pt-8 pb-16 sm:px-6 lg:pt-16">
        <section className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="grid justify-items-start gap-6">
            <h1 className="max-w-[16ch] text-[2.45rem] leading-[1.05] font-bold tracking-[-0.03em] sm:text-[3.05rem] lg:text-[3.8rem]">
              Facturas con VERI*FACTU, sin pagar por ello.
            </h1>
            <p className="max-w-[56ch] text-lg text-muted-foreground">
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
          <SampleInvoice />
        </section>

        <section aria-labelledby="que-hace" className="grid gap-6">
          <h2 id="que-hace" className="text-2xl font-bold tracking-[-0.01em]">
            Qué hace por ti
          </h2>
          <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="grid gap-1 border-t-2 border-foreground pt-3">
                <dt className="font-bold">{feature.title}</dt>
                <dd className="text-muted-foreground">{feature.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="max-w-[70ch] rounded-md border border-copy-yellow-ink/25 bg-copy-yellow px-4 py-3 text-sm text-copy-yellow-ink">
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
