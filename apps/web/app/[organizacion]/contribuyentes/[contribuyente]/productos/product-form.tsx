"use client";
import { ActionForm, type FormAction } from "@/components/action-form";
import { Field } from "@/components/form";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { TAX_OPTIONS } from "@/lib/invoicing";

/** Alta de producto: en fila en su pantalla; apilado (`stacked`) dentro de una ventana, con el nombre ya escrito. */
export function ProductForm({ action, defaultName = "", stacked = false }: { readonly action: FormAction; readonly defaultName?: string; readonly stacked?: boolean }) {
  return (
    <ActionForm action={action} className={stacked ? "grid gap-3" : "grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"} label="Nuevo producto">
      {({ pending, errors, values }) => (
        <>
          <Field name="name" label="Nombre" required maxLength={200} defaultValue={values["name"] ?? defaultName} error={errors["name"]} />
          <Field name="unitPrice" label="Precio sin IVA (€)" inputMode="decimal" required defaultValue={values["unitPrice"]} error={errors["unitPrice"]} />
          <SelectField name="tax" label="IVA" defaultValue="VAT:2100" options={TAX_OPTIONS} />
          <Button type="submit" size={stacked ? "lg" : "default"} disabled={pending}>
            {pending ? "Guardando…" : stacked ? "Guardar y añadir a la factura" : "Guardar"}
          </Button>
        </>
      )}
    </ActionForm>
  );
}
