// Esqueletos de carga con la forma real de la pantalla: al llegar los datos nada salta de sitio. El texto de
// carga solo lo oyen los lectores de pantalla (role="status"); lo visual es decorativo (aria-hidden).
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand";

function Bar({ className }: { readonly className: string }) {
  return <span className={`skeleton block ${className}`} />;
}

function StaticBrand() {
  return (
    <span className="flex items-center gap-2 text-[0.95rem] font-semibold tracking-[-0.01em]">
      <BrandMark />
      FacturaLibre
    </span>
  );
}

/** Cuerpo de una pantalla: título, subtítulo y una superficie con filas como las de una tabla. */
function ContentSkeleton() {
  return (
    <div className="grid content-start gap-6">
      <div className="grid gap-2.5">
        <Bar className="h-7 w-56 sm:h-8 sm:w-72" />
        <Bar className="h-4 w-full max-w-md" />
      </div>
      <div className="surface overflow-hidden">
        <div className="flex gap-6 border-b bg-subtle px-5 py-3">
          <Bar className="h-3 w-20" />
          <Bar className="h-3 w-28" />
          <Bar className="ml-auto h-3 w-16" />
        </div>
        {[72, 56, 64, 48, 60].map((width) => (
          <div key={width} className="flex items-center gap-6 border-t px-5 py-4 first:border-t-0">
            <Bar className="h-3.5 w-24" />
            <span className="hidden flex-1 sm:block">
              <Bar className="h-3.5" />
            </span>
            <span style={{ width: `${String(width)}px` }} className="ml-auto">
              <Bar className="h-3.5 w-full" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Shell({ message, children }: { readonly message: string; readonly children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{message}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

/** Pantallas de una organización: lateral (organización y secciones) y contenido. */
export function FrameSkeleton({ message }: { readonly message: string }) {
  return (
    <Shell message={message}>
      <div className="flex min-h-screen flex-col lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
        <div className="border-b bg-subtle lg:border-r lg:border-b-0">
          <div className="grid gap-3 px-4 py-3 lg:sticky lg:top-0 lg:h-screen lg:content-start lg:gap-5 lg:px-3 lg:py-5">
            <div className="lg:px-2.5">
              <StaticBrand />
            </div>
            <div className="flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5">
              <Bar className="size-7 rounded-md" />
              <span className="grid flex-1 gap-1.5">
                <Bar className="h-3 w-32" />
                <Bar className="h-2.5 w-16" />
              </span>
            </div>
            <div className="flex gap-2 overflow-hidden lg:grid lg:gap-2.5 lg:px-2.5">
              {[64, 96, 72, 88, 80, 104, 76].map((width, index) => (
                <span key={width} className={`flex shrink-0 items-center gap-2.5 ${index > 3 ? "hidden lg:flex" : ""}`}>
                  <Bar className="size-4 rounded" />
                  <span style={{ width: `${String(width)}px` }}>
                    <Bar className="h-3 w-full" />
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
        <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 lg:px-10 lg:py-10">
          <ContentSkeleton />
        </main>
      </div>
    </Shell>
  );
}

/** Pantallas fuera de una organización (cuenta, organizaciones…): cabecera y contenido. */
export function PageSkeleton({ message }: { readonly message: string }) {
  return (
    <Shell message={message}>
      <div className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 sm:px-8">
          <StaticBrand />
          <Bar className="h-4 w-36" />
        </div>
      </div>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">
        <ContentSkeleton />
      </main>
    </Shell>
  );
}
