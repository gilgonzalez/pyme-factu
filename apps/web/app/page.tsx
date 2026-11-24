import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

// Página pública. El acceso lleva a /organizaciones (selector) tras iniciar sesión.
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-medium text-muted-foreground">En desarrollo · Fase 2</p>
      <h1 className="font-heading text-4xl font-semibold tracking-tight">FacturaLibre</h1>
      <p className="text-lg text-muted-foreground">
        Facturación gratuita para autónomos, empresas y gestorías en España, diseñada para la modalidad VERI*FACTU.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/registro" className={buttonVariants({ size: "lg" })}>
          Crear cuenta gratis
        </Link>
        <Link href="/entrar" className={buttonVariants({ size: "lg", variant: "outline" })}>
          Iniciar sesión
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Este software está en desarrollo y todavía no emite facturas ni registros de facturación. No está homologado ni
        certificado por la Agencia Tributaria.
      </p>
    </main>
  );
}
