// Piezas de formulario accesibles: cada campo tiene etiqueta visible, el error se asocia con
// aria-describedby y los avisos se anuncian a lectores de pantalla (role="alert" / "status").
import { Brand } from "@/components/brand";
import { Suspense, useId, type ComponentProps, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FieldProps extends Omit<ComponentProps<typeof Input>, "id" | "name"> {
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | undefined;
}

export function Field({ name, label, hint, error, ...input }: FieldProps) {
  // Único en la página aunque dos formularios tengan un campo con el mismo nombre (p. ej. «reason»).
  const id = `campo-${name}-${useId()}`;
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
  const styles = tone === "error" ? "border-danger-ink/25 bg-danger-soft text-danger-ink" : "border-success-ink/25 bg-success-soft text-success-ink";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>
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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
      <Brand href="/" />
      <div className="surface grid gap-6 p-6 sm:p-8">
        <header className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
        </header>
        <Suspense>{children}</Suspense>
      </div>
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
