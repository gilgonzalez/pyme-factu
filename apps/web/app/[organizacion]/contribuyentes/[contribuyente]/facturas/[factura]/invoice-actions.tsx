"use client";
import { ActionForm, type FormAction } from "@/components/action-form";
import { Field } from "@/components/form";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { RECTIFICATION_OPTIONS } from "@/lib/invoicing";

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
          <SelectField
            name="code"
            label="Tipo de rectificación"
            placeholder="Elige el supuesto…"
            defaultValue={RECTIFICATION_OPTIONS.find((option) => option.value === values["code"])?.value ?? ""}
            options={RECTIFICATION_OPTIONS}
            error={errors["code"]}
          />
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Preparando…" : "Preparar factura rectificativa"}
          </Button>
        </>
      )}
    </ActionForm>
  );
}

/**
 * Anular: solo para una factura expedida por error, sin operación real (OM HAC/1177/2024, art. 11). Si hubo
 * operación y hay que corregirla, lo que procede es una rectificativa.
 */
export function AnnulForm({ action }: { readonly action: FormAction }) {
  return (
    <ActionForm action={action} className="grid max-w-xl gap-3" label="Anular la factura">
      {({ pending, errors, values }) => (
        <>
          <Field
            name="reason"
            label="Por qué se anula"
            hint="Por ejemplo: «Expedida por error: no hubo venta»."
            required
            maxLength={500}
            defaultValue={values["reason"]}
            error={errors["reason"]}
          />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirm" required className="mt-1" />
            <span>
              Confirmo que esta factura se expidió por error y <strong>no corresponde a ninguna operación real</strong>. Se generará un registro de
              anulación que no se puede deshacer.
            </span>
          </label>
          <Button type="submit" variant="destructive" disabled={pending}>
            {pending ? "Anulando…" : "Anular factura"}
          </Button>
        </>
      )}
    </ActionForm>
  );
}
