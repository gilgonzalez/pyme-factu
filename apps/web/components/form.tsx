// Piezas de formulario accesibles: cada campo tiene etiqueta visible, el error se asocia con
// aria-describedby y los avisos se anuncian a lectores de pantalla (role="alert" / "status").
import { CircleAlert, CircleCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { FrameSkeleton, PageSkeleton } from "@/components/page-skeleton";
import { Suspense, useId, type ComponentProps, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Error de un campo, con icono para encontrarlo de un vistazo; `id` es el que cita aria-describedby. */
export function FieldError({ id, error }: { readonly id: string; readonly error: string | undefined }) {
  if (error === undefined) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 text-[0.8125rem] leading-snug font-medium text-destructive">
      <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      {error}
    </p>
  );
}

/** Pista bajo un campo. */
export function FieldHint({ id, children }: { readonly id: string; readonly children: ReactNode }) {
  return (
    <p id={id} className="text-[0.8125rem] leading-snug text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * Ancho de un campo según lo que se escribe en él (solo desde tablet; en móvil, todo el ancho):
 * xs días o %, sm código postal o cantidades, md NIF o teléfono, lg email, web o IBAN; full, texto libre.
 */
export type FieldWidth = "xs" | "sm" | "md" | "lg" | "full";

export const FIELD_WIDTHS: Readonly<Record<FieldWidth, string>> = {
  xs: "sm:w-28",
  sm: "sm:w-40",
  md: "sm:w-60",
  lg: "sm:w-96 sm:max-w-full",
  full: "w-full",
};

interface FieldProps extends Omit<ComponentProps<typeof Input>, "id" | "name" | "width"> {
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | undefined;
  readonly width?: FieldWidth;
}

export function Field({ name, label, hint, error, width = "full", ...input }: FieldProps) {
  // Único en la página aunque dos formularios tengan un campo con el mismo nombre (p. ej. «reason»).
  const id = `campo-${name}-${useId()}`;
  const describedBy = [hint === undefined ? null : `${id}-ayuda`, error === undefined ? null : `${id}-error`].filter(Boolean).join(" ");
  return (
    <div className={`grid min-w-0 content-start gap-1.5 ${FIELD_WIDTHS[width]}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} aria-invalid={error === undefined ? undefined : true} aria-describedby={describedBy || undefined} {...input} />
      {hint === undefined ? null : <FieldHint id={`${id}-ayuda`}>{hint}</FieldHint>}
      <FieldError id={`${id}-error`} error={error} />
    </div>
  );
}

export function FormAlert({ tone, children }: { readonly tone: "error" | "success"; readonly children: ReactNode }) {
  const styles = tone === "error" ? "border-danger-ink/20 bg-danger-soft text-danger-ink" : "border-success-ink/20 bg-success-soft text-success-ink";
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-[10px] border px-3.5 py-3 text-sm ${styles}`}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export type Skeleton = "page" | "frame";

/**
 * Contenido que lee la petición (sesión, cookies, searchParams): con cacheComponents va tras un <Suspense>.
 * Mientras llega, un esqueleto con la forma de la pantalla (`frame`: con el lateral de la organización).
 */
export function Streamed({ message, skeleton = "page", children }: { readonly message: string; readonly skeleton?: Skeleton; readonly children: ReactNode }) {
  const fallback = skeleton === "frame" ? <FrameSkeleton message={message} /> : <PageSkeleton message={message} />;
  return <Suspense fallback={fallback}>{children}</Suspense>;
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
export function streamedPage<Props extends object>(message: string, Content: (props: Props) => Promise<ReactNode>, skeleton: Skeleton = "page") {
  return function StreamedPage(props: Props) {
    return (
      <Streamed message={message} skeleton={skeleton}>
        <Content {...props} />
      </Streamed>
    );
  };
}
