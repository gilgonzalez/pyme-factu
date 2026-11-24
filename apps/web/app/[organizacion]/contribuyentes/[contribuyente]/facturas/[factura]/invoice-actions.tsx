"use client";
import { ActionForm, type FormAction } from "@/components/action-form";
import { Field } from "@/components/form";
import { Button } from "@/components/ui/button";

/** Emitir: asigna número y la factura queda inalterable. Se pide confirmación explícita. */
export function IssueForm({ action, total }: { readonly action: FormAction; readonly total: string }) {
  return (
    <ActionForm action={action} className="grid gap-2" label="Emitir la factura">
      {({ pending }) => (
        <>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirm" required className="mt-1" />
            <span>
              He revisado la factura ({total}). Al emitirla recibe número y <strong>ya no se podrá modificar</strong>; para corregirla habrá
              que rectificarla.
            </span>
          </label>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Emitiendo…" : "Emitir factura"}
          </Button>
        </>
      )}
    </ActionForm>
  );
}

export function DeleteDraftForm({ action }: { readonly action: FormAction }) {
  return (
    <ActionForm action={action} label="Borrar el borrador">
      {({ pending }) => (
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? "Borrando…" : "Borrar borrador"}
        </Button>
      )}
    </ActionForm>
  );
}

export function RectifyForm({ action }: { readonly action: FormAction }) {
  return (
    <ActionForm action={action} className="grid max-w-xl gap-3" label="Rectificar la factura">
      {({ pending, errors, values }) => (
        <>
          <Field
            name="reason"
            label="Motivo de la rectificación"
            hint="Constará en la factura rectificativa. Por ejemplo: «Precio unitario incorrecto»."
            required
            maxLength={500}
            defaultValue={values["reason"]}
            error={errors["reason"]}
          />
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Preparando…" : "Preparar factura rectificativa"}
          </Button>
        </>
      )}
    </ActionForm>
  );
}
