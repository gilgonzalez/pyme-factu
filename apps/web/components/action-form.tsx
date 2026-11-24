"use client";
// Formulario ligado a una Server Action que devuelve un aviso. Muestra el resultado junto al
// formulario (role="status"/"alert") y desactiva el envío mientras está en curso.
import { useActionState, type ReactNode } from "react";
import { FormAlert } from "@/components/form";

export type ActionResult = { readonly ok: boolean; readonly message: string; readonly errors?: Readonly<Record<string, string>> } | null;

interface ActionFormProps {
  readonly action: (previous: ActionResult, data: FormData) => Promise<ActionResult>;
  readonly children: (state: { readonly pending: boolean; readonly errors: Readonly<Record<string, string>> }) => ReactNode;
  readonly className?: string;
  readonly label?: string;
}

export function ActionForm({ action, children, className, label }: ActionFormProps) {
  const [result, formAction, pending] = useActionState<ActionResult, FormData>(action, null);
  return (
    <form action={formAction} className={className} aria-label={label}>
      {children({ pending, errors: result?.errors ?? {} })}
      {result === null || result.message === "" ? null : (
        <div className="basis-full">
          <FormAlert tone={result.ok ? "success" : "error"}>{result.message}</FormAlert>
        </div>
      )}
    </form>
  );
}
