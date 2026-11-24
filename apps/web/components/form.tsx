// Piezas de formulario accesibles: cada campo tiene etiqueta visible, el error se asocia con
// aria-describedby y los avisos se anuncian a lectores de pantalla (role="alert" / "status").
import Link from "next/link";
import { Suspense, type ComponentProps, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FieldProps extends Omit<ComponentProps<typeof Input>, "id" | "name"> {
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | undefined;
}

export function Field({ name, label, hint, error, ...input }: FieldProps) {
  const id = `campo-${name}`;
  const describedBy = [hint === undefined ? null : `${id}-ayuda`, error === undefined ? null : `${id}-error`].filter(Boolean).join(" ");
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} aria-invalid={error === undefined ? undefined : true} aria-describedby={describedBy || undefined} {...input} />
      {hint === undefined ? null : (
        <p id={`${id}-ayuda`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormAlert({ tone, children }: { readonly tone: "error" | "success"; readonly children: ReactNode }) {
  const styles = tone === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-emerald-600/30 bg-emerald-50 text-emerald-900";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${styles}`}>
      {children}
    </div>
  );
}

/** Contenido que lee la petición (sesión, cookies, searchParams): con cacheComponents va tras un <Suspense>. */
export function Streamed({ message, children }: { readonly message: string; readonly children: ReactNode }) {
  return <Suspense fallback={<p className="p-6 text-muted-foreground">{message}</p>}>{children}</Suspense>;
}

/**
 * Contenedor centrado de las pantallas de acceso. Envuelve el contenido en <Suspense> porque los
 * formularios leen ?volver= / ?token= (useSearchParams) y eso no puede formar parte del HTML estático.
 */
export function AuthShell({ title, description, children }: { readonly title: string; readonly description: string; readonly children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-12">
      <header className="grid gap-2">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          FacturaLibre
        </Link>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </header>
      <Suspense>{children}</Suspense>
    </main>
  );
}

/** Página de acceso: título, descripción y un único formulario cliente. */
export function authPage(title: string, description: string, Form: () => ReactNode) {
  return function AuthPage() {
    return (
      <AuthShell title={title} description={description}>
        <Form />
      </AuthShell>
    );
  };
}

/** Página cuyo contenido depende de la petición (sesión): se transmite tras un <Suspense>. */
export function streamedPage<Props extends object>(message: string, Content: (props: Props) => Promise<ReactNode>) {
  return function StreamedPage(props: Props) {
    return (
      <Streamed message={message}>
        <Content {...props} />
      </Streamed>
    );
  };
}
