"use client";
// Suspender (con motivo, que queda en la auditoría) y reactivar organizaciones y cuentas.
import { ActionButton } from "@/components/action-button";
import { ActionForm, type FormAction } from "@/components/action-form";
import { Field } from "@/components/form";
import { Button } from "@/components/ui/button";

export function SuspendForm({ action, label }: { readonly action: FormAction; readonly label: string }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-sm font-medium text-destructive hover:underline [&::-webkit-details-marker]:hidden">Suspender…</summary>
      <ActionForm action={action} className="mt-2 grid w-72 gap-2" label={label}>
        {({ pending }) => (
          <>
            <Field name="reason" label="Motivo (opcional)" maxLength={500} placeholder="Impago, abuso, petición del titular…" />
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Suspendiendo…" : "Suspender"}
            </Button>
          </>
        )}
      </ActionForm>
    </details>
  );
}

export const ReactivateButton = ({ action, label }: { readonly action: FormAction; readonly label: string }) => (
  <ActionButton action={action} label={label} idle="Reactivar" busy="Reactivando…" variant="outline" />
);

export const SupportButton = ({ action, label }: { readonly action: FormAction; readonly label: string }) => (
  <ActionButton action={action} label={label} idle="Entrar en soporte" busy="Abriendo…" variant="outline" />
);
