"use client";
// Formulario ligado a una Server Action que devuelve un aviso. Muestra el resultado junto al
// formulario (role="status"/"alert") y desactiva el envío mientras está en curso.
// React vacía el formulario al terminar la acción: si hay errores, los valores enviados vuelven
// como `values` para usarlos de defaultValue y que la persona no tenga que reescribirlo todo.
import { useActionState, type ReactNode } from "react";
import { FormAlert } from "@/components/form";

export type ActionResult = { readonly ok: boolean; readonly message: string; readonly errors?: Readonly<Record<string, string>> } | null;

/** Server Action enlazada (bind) lista para useActionState. */
export type FormAction = (previous: ActionResult, data: FormData) => Promise<ActionResult>;

export interface ActionFormState {
  readonly pending: boolean;
  readonly errors: Readonly<Record<string, string>>;
  /** Valores enviados en el último intento fallido (vacío si no hubo o si fue bien). */
  readonly values: Readonly<Record<string, string>>;
}

interface ActionFormProps {
  readonly action: FormAction;
  readonly children: (state: ActionFormState) => ReactNode;
  readonly className?: string;
  readonly label?: string;
}

type Submitted = { readonly result: ActionResult; readonly values: Readonly<Record<string, string>> };
const INITIAL: Submitted = { result: null, values: {} };

const textValues = (data: FormData): Record<string, string> =>
  Object.fromEntries([...data.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string"));

export function ActionForm({ action, children, className, label }: ActionFormProps) {
  const [{ result, values }, formAction, pending] = useActionState<Submitted, FormData>(async (previous, data) => {
    const next = await action(previous.result, data);
    return { result: next, values: next?.ok === false ? textValues(data) : {} };
  }, INITIAL);
  return (
    <form action={formAction} className={className} aria-label={label}>
      {children({ pending, errors: result?.errors ?? {}, values })}
      {result === null || result.message === "" ? null : (
        <div className="basis-full">
          <FormAlert tone={result.ok ? "success" : "error"}>{result.message}</FormAlert>
        </div>
      )}
    </form>
  );
}
