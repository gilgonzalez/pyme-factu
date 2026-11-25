"use client";
import { ActionForm, type FormAction } from "@/components/action-form";
import { Field } from "@/components/form";
import { Button } from "@/components/ui/button";

export function DeactivateForm({ action }: { readonly action: FormAction }) {
  return (
    <ActionForm action={action} className="grid max-w-xl gap-3" label="Desactivar la cuenta">
      {({ pending, errors, values }) => (
        <>
          <Field name="email" type="email" label="Escribe tu email para confirmar" required defaultValue={values["email"]} error={errors["email"]} autoComplete="off" />
          <Button type="submit" variant="destructive" disabled={pending}>
            {pending ? "Desactivando…" : "Desactivar mi cuenta"}
          </Button>
        </>
      )}
    </ActionForm>
  );
}
