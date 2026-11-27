"use client";
// Formulario de acceso genérico: gestiona el envío, el estado "enviando" y los mensajes.
// Cada pantalla solo define sus campos y qué hacer con los datos.
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/form";

export type AuthFormOutcome =
  | { readonly error: string; /** Algo que hacer además del aviso (p. ej. reenviar la confirmación). */ readonly action?: ReactNode }
  | { readonly success: ReactNode; /** Debajo del aviso (p. ej. reenviar la confirmación). */ readonly after?: ReactNode }
  | { readonly redirected: true };

interface AuthFormProps {
  readonly submitLabel: string;
  readonly pendingLabel: string;
  readonly onSubmit: (data: FormData) => Promise<AuthFormOutcome>;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}

export function AuthForm({ submitLabel, pendingLabel, onSubmit, children, footer }: AuthFormProps) {
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<AuthFormOutcome | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setOutcome(null);
    try {
      setOutcome(await onSubmit(new FormData(event.currentTarget)));
    } catch {
      setOutcome({ error: "No hemos podido conectar. Revisa tu conexión e inténtalo de nuevo." });
    } finally {
      setPending(false);
    }
  }

  if (outcome !== null && "success" in outcome) {
    return (
      <div className="grid gap-4">
        <FormAlert tone="success">{outcome.success}</FormAlert>
        {outcome.after}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate={false}>
      {outcome !== null && "error" in outcome ? (
        <div className="grid gap-3">
          <FormAlert tone="error">{outcome.error}</FormAlert>
          {outcome.action}
        </div>
      ) : null}
      {children}
      <Button type="submit" size="lg" disabled={pending} aria-disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
      {footer}
    </form>
  );
}
