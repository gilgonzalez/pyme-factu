// Página pública provisional (Fase 1). El acceso, el onboarding y el panel llegan en la Fase 2.
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-medium text-muted-foreground">En desarrollo · Fase 1</p>
      <h1 className="font-heading text-4xl font-semibold tracking-tight">FacturaLibre</h1>
      <p className="text-lg text-muted-foreground">
        Facturación gratuita para autónomos, empresas y gestorías en España, diseñada para la modalidad VERI*FACTU.
      </p>
      <p className="text-sm text-muted-foreground">
        Este software está en desarrollo y todavía no emite facturas ni registros de facturación. No está homologado ni
        certificado por la Agencia Tributaria.
      </p>
    </main>
  );
}
