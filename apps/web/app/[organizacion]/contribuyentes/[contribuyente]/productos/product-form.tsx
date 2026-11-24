"use client";
import { ActionForm, type FormAction } from "@/components/action-form";
import { Field } from "@/components/form";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { TAX_OPTIONS } from "@/lib/invoicing";

export function ProductForm({ action }: { readonly action: FormAction }) {
  return (
    <ActionForm action={action} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end" label="Nuevo producto">
      {({ pending, errors, values }) => (
        <>
          <Field name="name" label="Nombre" required maxLength={200} defaultValue={values["name"]} error={errors["name"]} />
          <Field name="unitPrice" label="Precio sin IVA (€)" inputMode="decimal" required defaultValue={values["unitPrice"]} error={errors["unitPrice"]} />
          <SelectField name="tax" label="IVA" defaultValue="VAT:2100" options={TAX_OPTIONS} />
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </>
      )}
    </ActionForm>
  );
}
